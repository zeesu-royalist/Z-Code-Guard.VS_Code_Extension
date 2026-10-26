import * as fs from 'fs';
import * as path from 'path';
import { ChangedFile, ImpactReference } from '../models/scanResult';

/**
 * Directories ignored when searching for workspace impact references.
 */
const IGNORED_IMPACT_DIRS = new Set([
  'node_modules',
  'dist',
  'out',
  'build',
  'coverage',
  '.git',
  '.vscode',
  '.next',
  '.nuxt',
]);

/**
 * Determines whether a file path represents an automated test file.
 */
export function isTestFile(filePath: string): boolean {
  const norm = filePath.replace(/\\/g, '/').toLowerCase();
  return (
    norm.includes('/test/') ||
    norm.includes('/tests/') ||
    norm.includes('/__tests__/') ||
    norm.endsWith('.test.ts') ||
    norm.endsWith('.test.tsx') ||
    norm.endsWith('.test.js') ||
    norm.endsWith('.test.jsx') ||
    norm.endsWith('.spec.ts') ||
    norm.endsWith('.spec.tsx') ||
    norm.endsWith('.spec.js') ||
    norm.endsWith('.spec.jsx')
  );
}

/**
 * Strips file extension and directory to derive import module identifiers.
 */
export function getImportBaseNames(relativeFilePath: string): string[] {
  const norm = relativeFilePath.replace(/\\/g, '/');
  const withoutExt = norm.replace(/\.[^/.]+$/, '');
  const baseName = path.basename(withoutExt);
  return [withoutExt, baseName];
}

/**
 * Searches the workspace for references to changed exported symbols and modules.
 *
 * @param workspaceRoot - Absolute path to workspace root.
 * @param changedFiles - List of changed files with identified symbols.
 * @param maxFilesToScan - Cap on files scanned to ensure fast responsiveness.
 */
export async function analyzeWorkspaceImpact(
  workspaceRoot: string,
  changedFiles: ChangedFile[],
  maxFilesToScan: number = 300
): Promise<Map<string, ImpactReference[]>> {
  const impactMap = new Map<string, ImpactReference[]>();

  // Filter to changed files that have exported symbols or module changes
  const targetFiles = changedFiles.filter(
    (f) =>
      !f.isDeleted &&
      (f.path.endsWith('.ts') ||
        f.path.endsWith('.tsx') ||
        f.path.endsWith('.js') ||
        f.path.endsWith('.jsx'))
  );

  if (targetFiles.length === 0) {
    return impactMap;
  }

  // Collect candidate project files to inspect
  const candidateFiles: string[] = [];
  await collectWorkspaceFiles(workspaceRoot, workspaceRoot, candidateFiles, maxFilesToScan);

  for (const target of targetFiles) {
    const targetRelative = target.path;
    const targetBaseNames = getImportBaseNames(targetRelative);
    const exportedSymbols = (target.symbols || []).filter((s) => s.isExported);

    const references: ImpactReference[] = [];
    const seen = new Set<string>();

    for (const candidateRelative of candidateFiles) {
      // Don't search inside the target file itself
      if (candidateRelative === targetRelative) {
        continue;
      }

      const candidateFull = path.join(workspaceRoot, candidateRelative);
      let content = '';
      try {
        content = await fs.promises.readFile(candidateFull, 'utf8');
      } catch {
        continue;
      }

      const lines = content.split(/\r?\n/);
      const isTest = isTestFile(candidateRelative);

      for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
        const line = lines[lineIdx];
        const trimmed = line.trim();

        // 1. Check for import from target module
        let matchesModule = false;
        for (const base of targetBaseNames) {
          if (
            (trimmed.startsWith('import ') || trimmed.startsWith('const ') || trimmed.startsWith('require(')) &&
            (trimmed.includes(`/${base}'`) ||
              trimmed.includes(`/${base}"`) ||
              trimmed.includes(`./${base}'`) ||
              trimmed.includes(`./${base}"`))
          ) {
            matchesModule = true;
            break;
          }
        }

        if (matchesModule) {
          // Check if any specific exported symbol is mentioned
          let matchedSymbol = targetBaseNames[1];
          for (const sym of exportedSymbols) {
            if (trimmed.includes(sym.name)) {
              matchedSymbol = sym.name;
              break;
            }
          }

          const refKey = `${candidateRelative}:${matchedSymbol}:${lineIdx + 1}`;
          if (!seen.has(refKey)) {
            seen.add(refKey);
            references.push({
              referencingFile: candidateRelative,
              referencingSymbol: matchedSymbol,
              referenceType: isTest ? 'test_file' : 'verified_import',
              evidence: `L${lineIdx + 1}: ${trimmed.slice(0, 100)}`,
              targetSymbol: matchedSymbol,
              isVerified: true,
            });
          }
        } else if (exportedSymbols.length > 0) {
          // 2. Check for exported symbol references in other files
          for (const sym of exportedSymbols) {
            // Avoid 1-2 char names to prevent noisy text matches
            if (sym.name.length < 3) {
              continue;
            }

            const symbolRegex = new RegExp(`\\b${sym.name}\\b`);
            if (symbolRegex.test(trimmed)) {
              const refKey = `${candidateRelative}:${sym.name}:${lineIdx + 1}`;
              if (!seen.has(refKey)) {
                seen.add(refKey);
                references.push({
                  referencingFile: candidateRelative,
                  referencingSymbol: sym.name,
                  referenceType: isTest ? 'test_file' : 'heuristic_text',
                  evidence: `L${lineIdx + 1}: ${trimmed.slice(0, 100)}`,
                  targetSymbol: sym.name,
                  isVerified: false,
                });
              }
            }
          }
        }
      }
    }

    if (references.length > 0) {
      impactMap.set(targetRelative, references);
    }
  }

  return impactMap;
}

/**
 * Recursively collects project source files while skipping ignored directories.
 */
async function collectWorkspaceFiles(
  dir: string,
  workspaceRoot: string,
  result: string[],
  maxLimit: number
): Promise<void> {
  if (result.length >= maxLimit) {
    return;
  }

  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (result.length >= maxLimit) {
      break;
    }

    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(workspaceRoot, fullPath).replace(/\\/g, '/');

    if (entry.isDirectory()) {
      if (!IGNORED_IMPACT_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
        await collectWorkspaceFiles(fullPath, workspaceRoot, result, maxLimit);
      }
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (['.ts', '.tsx', '.js', '.jsx', '.json'].includes(ext)) {
        result.push(relativePath);
      }
    }
  }
}
