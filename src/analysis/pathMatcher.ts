import { ZCodeGuardConfig } from '../config/configSchema';
import { GitFileChange } from '../git/gitStatusParser';
import { ChangedFile } from '../models/scanResult';

/**
 * Normalizes a file path for consistent cross-platform matching.
 * Converts backslashes '\' to forward slashes '/', trims whitespace,
 * and strips any leading './' or '/'.
 *
 * @param filePath - The path to normalize.
 */
export function normalizePath(filePath: string): string {
  if (!filePath) {
    return '';
  }

  let normalized = filePath.trim().replace(/\\/g, '/');
  // Strip leading ./
  normalized = normalized.replace(/^\.\//, '');
  // Strip leading /
  normalized = normalized.replace(/^\//, '');

  return normalized;
}

/**
 * Converts a glob pattern string into an equivalent regular expression.
 *
 * Supported features:
 * - Double star and slash (globstar) matches zero or more directory levels (e.g. "src/auth/**").
 * - Trailing double star matches everything inside that folder recursively.
 * - Single star matches any character within a single directory segment (does not cross '/').
 * - Question mark matches any single character except '/'.
 * - Literal characters and special regex characters are escaped.
 * - Matching is case-insensitive ('i') for predictable cross-platform behavior.
 *
 * @param pattern - Glob pattern to compile.
 */
export function globToRegex(pattern: string): RegExp {
  let p = normalizePath(pattern);

  // If pattern ends with '/', treat it as a directory matching all descendants
  if (p.endsWith('/')) {
    p = p + '**';
  }

  let regexStr = '';
  let i = 0;

  while (i < p.length) {
    const c = p[i];

    if (c === '*') {
      if (p[i + 1] === '*') {
        // Globstar: '**'
        i += 2;
        if (p[i] === '/') {
          // '/**/' or '**/': matches zero or more path segments
          regexStr += '(?:^|.*/)';
          i++;
        } else {
          // '**' matches any characters across path segments
          regexStr += '.*';
        }
      } else {
        // Single '*': matches any characters except '/'
        regexStr += '[^/]*';
        i++;
      }
    } else if (c === '?') {
      // '?': matches any single character except '/'
      regexStr += '[^/]';
      i++;
    } else if (['\\', '.', '+', '^', '$', '(', ')', '[', ']', '{', '}', '|'].includes(c)) {
      // Escape special regex characters
      regexStr += '\\' + c;
      i++;
    } else {
      regexStr += c;
      i++;
    }
  }

  return new RegExp('^' + regexStr + '$', 'i');
}

/**
 * Determines whether a file path matches a given glob or path pattern.
 *
 * @param filePath - Workspace-relative file path.
 * @param pattern - Pattern from protectedPaths or excludePaths.
 */
export function matchesPattern(filePath: string, pattern: string): boolean {
  const normPath = normalizePath(filePath);
  const normPattern = normalizePath(pattern);

  if (!normPath || !normPattern) {
    return false;
  }

  // 1. Exact match (case-insensitive)
  if (normPath.toLowerCase() === normPattern.toLowerCase()) {
    return true;
  }

  // 2. Directory prefix match (if pattern has no wildcards, e.g. "src/auth" matching "src/auth/session.ts")
  if (!normPattern.includes('*') && !normPattern.includes('?')) {
    const dirPrefix = normPattern.endsWith('/')
      ? normPattern.toLowerCase()
      : normPattern.toLowerCase() + '/';
    if (normPath.toLowerCase().startsWith(dirPrefix)) {
      return true;
    }
  }

  // 3. Glob matching via regex
  try {
    const regex = globToRegex(normPattern);
    return regex.test(normPath);
  } catch {
    // If pattern compilation fails for any reason, fail closed safely
    return false;
  }
}

/**
 * Checks if a file path matches any exclusion pattern.
 *
 * @param filePath - Workspace-relative file path.
 * @param excludePatterns - Configured exclusion patterns.
 */
export function isPathExcluded(filePath: string, excludePatterns?: string[]): boolean {
  if (!excludePatterns || excludePatterns.length === 0) {
    return false;
  }

  for (const pattern of excludePatterns) {
    if (matchesPattern(filePath, pattern)) {
      return true;
    }
  }

  return false;
}

/**
 * Finds all protected patterns that match a given file path.
 *
 * @param filePath - Workspace-relative file path.
 * @param protectedPatterns - Array of protected patterns from configuration.
 * @returns Array of matched patterns (empty if none match).
 */
export function findMatchingProtectedPatterns(
  filePath: string,
  protectedPatterns: string[]
): string[] {
  if (!protectedPatterns || protectedPatterns.length === 0) {
    return [];
  }

  const matches: string[] = [];
  for (const pattern of protectedPatterns) {
    if (matchesPattern(filePath, pattern)) {
      matches.push(pattern);
    }
  }

  return matches;
}

/**
 * Result of classifying a single Git change.
 */
export interface FileClassificationResult {
  isExcluded: boolean;
  changedFile?: ChangedFile;
}

/**
 * Classifies a discovered Git change against the project configuration.
 *
 * PRECEDENCE RULE:
 * Exclusions take strict precedence over protected paths. If a path matches
 * any entry in `excludePaths`, it is excluded from the scan results and will
 * NEVER be reported as protected.
 *
 * For renames: Both the destination path and original path are checked.
 *
 * @param file - Discovered change from Git status.
 * @param config - Validated ZCodeGuardConfig.
 */
export function classifyFile(
  file: GitFileChange,
  config: ZCodeGuardConfig
): FileClassificationResult {
  const normPath = normalizePath(file.path);
  const normOldPath = file.oldPath ? normalizePath(file.oldPath) : undefined;

  // 1. Check exclusions first (Precedence Rule)
  if (isPathExcluded(normPath, config.excludePaths)) {
    return { isExcluded: true };
  }

  if (normOldPath && isPathExcluded(normOldPath, config.excludePaths)) {
    return { isExcluded: true };
  }

  // 2. Check protected patterns
  const pathMatches = findMatchingProtectedPatterns(normPath, config.protectedPaths);
  const oldPathMatches = normOldPath
    ? findMatchingProtectedPatterns(normOldPath, config.protectedPaths)
    : [];

  // Deduplicate matched patterns
  const matchedPatterns = Array.from(new Set([...pathMatches, ...oldPathMatches]));

  const kind = matchedPatterns.length > 0 ? 'protected' : 'other';

  const changedFile: ChangedFile = {
    path: normPath,
    ...(normOldPath ? { oldPath: normOldPath } : {}),
    kind,
    matchedPatterns,
    isStaged: file.isStaged,
    isUnstaged: file.isUnstaged,
    isUntracked: file.isUntracked,
    isDeleted: file.isDeleted,
    isRenamed: file.isRenamed,
  };

  return {
    isExcluded: false,
    changedFile,
  };
}
