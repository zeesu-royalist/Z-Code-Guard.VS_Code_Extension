import * as fs from 'fs';
import * as path from 'path';
import { ChangedSymbol, SymbolKind } from '../models/scanResult';
import { GitDiffHunk } from '../git/gitDiffScanner';

/**
 * Supported file extensions for symbol and AST-level analysis.
 */
export const SUPPORTED_SYMBOL_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
]);

/**
 * Checks if a file path is supported for code symbol analysis.
 */
export function isSymbolAnalysisSupported(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return SUPPORTED_SYMBOL_EXTENSIONS.has(ext);
}

/**
 * Extracts line-based code symbols from TypeScript/JavaScript source code.
 *
 * Uses balanced brace analysis and token recognition to accurately detect:
 * - Functions (declarations, arrows, expressions)
 * - Classes and methods
 * - Interfaces and type aliases
 * - Exported symbols
 * - Imports
 *
 * @param sourceCode - The content of the file.
 */
export function extractSymbolsFromSource(sourceCode: string): ChangedSymbol[] {
  if (!sourceCode || sourceCode.trim().length === 0) {
    return [];
  }

  const symbols: ChangedSymbol[] = [];
  const lines = sourceCode.split(/\r?\n/);

  // Track active class or interface block to tag methods
  let currentContainer: { name: string; kind: SymbolKind; startLine: number; depth: number } | null = null;
  let braceDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    // Skip comments and empty lines
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
      // Still count braces in comments? Let's strip single-line comments for brace counting
      const cleanLine = trimmed.replace(/\/\/.*$/, '');
      const openCount = (cleanLine.match(/{/g) || []).length;
      const closeCount = (cleanLine.match(/}/g) || []).length;
      braceDepth += openCount - closeCount;
      if (currentContainer && braceDepth < currentContainer.depth) {
        currentContainer = null;
      }
      continue;
    }

    const cleanLine = trimmed.replace(/\/\/.*$/, '');
    const isExported = /^(?:export\s+(?:default\s+)?)?/.test(trimmed) && trimmed.startsWith('export');

    // 1. Interfaces: [export] interface Foo
    const ifaceMatch = trimmed.match(/^(?:export\s+)?interface\s+([A-Za-z0-9_$]+)/);
    if (ifaceMatch) {
      const name = ifaceMatch[1];
      const endLine = findBlockEndLine(lines, i);
      symbols.push({
        name,
        kind: 'interface',
        startLine: lineNum,
        endLine,
        isExported,
        detail: trimmed.slice(0, 80),
      });
      currentContainer = { name, kind: 'interface', startLine: lineNum, depth: braceDepth + 1 };
    }

    // 2. Type aliases: [export] type Foo =
    const typeMatch = trimmed.match(/^(?:export\s+)?type\s+([A-Za-z0-9_$]+)\s*=/);
    if (typeMatch) {
      const name = typeMatch[1];
      symbols.push({
        name,
        kind: 'type',
        startLine: lineNum,
        endLine: lineNum,
        isExported,
        detail: trimmed.slice(0, 80),
      });
    }

    // 3. Classes: [export] [abstract] class Foo
    const classMatch = trimmed.match(/^(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z0-9_$]+)/);
    if (classMatch) {
      const name = classMatch[1];
      const endLine = findBlockEndLine(lines, i);
      symbols.push({
        name,
        kind: 'class',
        startLine: lineNum,
        endLine,
        isExported,
        detail: trimmed.slice(0, 80),
      });
      currentContainer = { name, kind: 'class', startLine: lineNum, depth: braceDepth + 1 };
    }

    // 4. Function declarations: [export] [async] function foo(...)
    const funcMatch = trimmed.match(
      /^(?:export\s+)?(?:default\s+)?(?:async\s+)?function(?:\s*\*|\s+)?([A-Za-z0-9_$]+)?\s*\(([^)]*)\)/
    );
    if (funcMatch) {
      const name = funcMatch[1] || 'anonymous';
      const signature = funcMatch[2] || '';
      const endLine = findBlockEndLine(lines, i);
      const isReactComponent = /^[A-Z]/.test(name) && (trimmed.includes('JSX') || trimmed.includes('React') || trimmed.includes('props'));

      symbols.push({
        name,
        kind: isReactComponent ? 'component' : 'function',
        startLine: lineNum,
        endLine,
        isExported,
        containerName: currentContainer?.name,
        detail: trimmed.slice(0, 80),
        signature: `(${signature.trim()})`,
      });
    }

    // 5. Const / let function or arrow function: [export] const foo = (async)? (...) =>
    const arrowMatch = trimmed.match(
      /^(?:export\s+)?(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*(?::\s*[^=]+)?\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z0-9_$]+)\s*=>/
    );
    if (arrowMatch) {
      const name = arrowMatch[1];
      const endLine = findBlockEndLine(lines, i);
      const isReactComponent = /^[A-Z]/.test(name);

      symbols.push({
        name,
        kind: isReactComponent ? 'component' : 'function',
        startLine: lineNum,
        endLine,
        isExported,
        containerName: currentContainer?.name,
        detail: trimmed.slice(0, 80),
      });
    }

    // 6. Methods within a class/interface: methodName(...) {
    if (currentContainer && currentContainer.kind === 'class') {
      const methodMatch = trimmed.match(
        /^(?:public|private|protected|static|async|\*|\s)*\s*([A-Za-z0-9_$]+)\s*\(([^)]*)\)(?:\s*:\s*[^{;]+)?\s*[{;]/
      );
      if (
        methodMatch &&
        !['if', 'for', 'while', 'switch', 'catch', 'constructor'].includes(methodMatch[1])
      ) {
        const name = methodMatch[1];
        const signature = methodMatch[2] || '';
        const endLine = findBlockEndLine(lines, i);
        symbols.push({
          name: `${currentContainer.name}.${name}`,
          kind: 'method',
          startLine: lineNum,
          endLine,
          isExported: false,
          containerName: currentContainer.name,
          signature: `(${signature.trim()})`,
        });
      }
    }

    // 7. Top-level imports: import { ... } from '...'
    if (trimmed.startsWith('import ') || trimmed.startsWith('import(')) {
      symbols.push({
        name: trimmed.slice(0, 60),
        kind: 'import',
        startLine: lineNum,
        endLine: lineNum,
        isExported: false,
        detail: trimmed,
      });
    }

    // Count braces to maintain depth
    const openCount = (cleanLine.match(/{/g) || []).length;
    const closeCount = (cleanLine.match(/}/g) || []).length;
    braceDepth += openCount - closeCount;

    if (currentContainer && braceDepth < currentContainer.depth) {
      currentContainer = null;
    }
  }

  return symbols;
}

/**
 * Finds the ending line of a braced block starting at or after startLineIndex.
 */
function findBlockEndLine(lines: string[], startLineIndex: number): number {
  let depth = 0;
  let opened = false;

  for (let i = startLineIndex; i < lines.length; i++) {
    const clean = lines[i].replace(/\/\/.*$/, '');
    for (const char of clean) {
      if (char === '{') {
        depth++;
        opened = true;
      } else if (char === '}') {
        depth--;
        if (opened && depth <= 0) {
          return i + 1;
        }
      }
    }
    // If it's a single-line statement without braces
    if (opened && depth <= 0) {
      return i + 1;
    }
  }

  return lines.length;
}

/**
 * Identifies which symbols inside a file were modified based on diff hunks.
 *
 * @param filePath - Workspace-relative path to the file.
 * @param fullPath - Absolute path to the file on disk.
 * @param hunks - Parsed diff hunks.
 */
export async function identifyChangedSymbols(
  filePath: string,
  fullPath: string,
  hunks: GitDiffHunk[]
): Promise<ChangedSymbol[]> {
  if (!isSymbolAnalysisSupported(filePath)) {
    return [];
  }

  let sourceCode = '';
  try {
    sourceCode = await fs.promises.readFile(fullPath, 'utf8');
  } catch {
    // If file is deleted or cannot be read, return empty
    return [];
  }

  const allSymbols = extractSymbolsFromSource(sourceCode);
  if (allSymbols.length === 0 || hunks.length === 0) {
    return [];
  }

  // Collect all changed line numbers in the new file
  const changedLines = new Set<number>();
  for (const hunk of hunks) {
    for (const l of hunk.addedLines) {
      changedLines.add(l);
    }
    // For deleted lines without added lines, mark hunk boundary
    if (hunk.addedLines.length === 0) {
      changedLines.add(Math.max(1, hunk.newStart));
    }
  }

  // Filter symbols whose range overlaps with changed lines
  const changedSymbols: ChangedSymbol[] = [];
  const seenSymbols = new Set<string>();

  for (const sym of allSymbols) {
    let matches = false;
    for (let l = sym.startLine; l <= sym.endLine; l++) {
      if (changedLines.has(l)) {
        matches = true;
        break;
      }
    }

    if (matches && !seenSymbols.has(sym.name + sym.startLine)) {
      seenSymbols.add(sym.name + sym.startLine);
      changedSymbols.push(sym);
    }
  }

  return changedSymbols;
}
