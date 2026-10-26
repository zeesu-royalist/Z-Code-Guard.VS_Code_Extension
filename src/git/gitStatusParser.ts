/**
 * Machine-readable Git status parser for Z-Code-Guard.
 *
 * Parses NUL-delimited output from `git status --porcelain=v1 -z --untracked-files=normal`.
 * Using -z ensures paths with spaces, quotes, and special characters are preserved
 * without ambiguous shell quoting or escaping.
 */

/**
 * Detailed representation of a changed file discovered by Git.
 */
export interface GitFileChange {
  /**
   * Workspace-relative path to the file.
   * For renames, this is the destination path (the new location).
   */
  path: string;

  /**
   * For renames and copies, the original path before the change.
   */
  oldPath?: string;

  /**
   * Status code of the index (staged changes).
   * 'M' = modified, 'A' = added, 'D' = deleted, 'R' = renamed, 'C' = copied, ' ' = unmodified, '?' = untracked.
   */
  indexStatus: string;

  /**
   * Status code of the work tree (unstaged changes).
   * 'M' = modified, 'D' = deleted, ' ' = unmodified, '?' = untracked.
   */
  workTreeStatus: string;

  /**
   * True if there are staged changes for this file in the Git index.
   */
  isStaged: boolean;

  /**
   * True if there are unstaged changes for this file in the working tree.
   */
  isUnstaged: boolean;

  /**
   * True if the file is not tracked by Git.
   */
  isUntracked: boolean;

  /**
   * True if the file has been deleted (staged or unstaged).
   */
  isDeleted: boolean;

  /**
   * True if the file has been renamed.
   */
  isRenamed: boolean;
}

/**
 * Normalizes file path separators to standard forward slashes '/'.
 * This ensures cross-platform consistency between macOS, Linux, and Windows.
 */
function normalizeSlashes(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

/**
 * Parses machine-readable NUL-delimited output from `git status --porcelain=v1 -z`.
 *
 * Each standard entry in the -z output has the format:
 * `XY <path>\0`
 *
 * For renames or copies (where X or Y is 'R' or 'C'), the format is:
 * `XY <path>\0<orig_path>\0`
 *
 * @param rawOutput - Raw NUL-delimited string output from git status.
 * @returns Array of parsed GitFileChange objects.
 */
export function parseGitStatus(rawOutput: string): GitFileChange[] {
  if (!rawOutput || rawOutput.trim().length === 0) {
    return [];
  }

  const results: GitFileChange[] = [];
  // Split on NUL delimiter
  const parts = rawOutput.split('\0');

  let i = 0;
  while (i < parts.length) {
    const item = parts[i];
    i++;

    // Trailing NUL or empty segment
    if (!item || item.length === 0) {
      continue;
    }

    // A valid status line must have at least 2 characters for XY and 1 for space
    if (item.length < 3) {
      // Malformed or incomplete entry; skip safely
      continue;
    }

    const indexStatus = item.charAt(0);
    const workTreeStatus = item.charAt(1);

    // Skip ignored entries if git status emitted them
    if (indexStatus === '!' && workTreeStatus === '!') {
      continue;
    }

    // Path begins immediately after the space at character 2
    const rawPath = item.substring(3);
    if (!rawPath || rawPath.length === 0) {
      continue;
    }

    const isRenamed = indexStatus === 'R' || workTreeStatus === 'R';
    const isCopied = indexStatus === 'C' || workTreeStatus === 'C';

    let oldPath: string | undefined = undefined;

    // For renames and copies, Git appends the original path as the next NUL-delimited field
    if ((isRenamed || isCopied) && i < parts.length) {
      const origPart = parts[i];
      i++;
      if (origPart && origPart.length > 0) {
        oldPath = normalizeSlashes(origPart);
      }
    }

    const isUntracked = indexStatus === '?' && workTreeStatus === '?';
    const isDeleted = indexStatus === 'D' || workTreeStatus === 'D';
    const isStaged = indexStatus !== ' ' && indexStatus !== '?' && indexStatus !== '!';
    const isUnstaged = workTreeStatus !== ' ' && workTreeStatus !== '?' && workTreeStatus !== '!';

    results.push({
      path: normalizeSlashes(rawPath),
      ...(oldPath ? { oldPath } : {}),
      indexStatus,
      workTreeStatus,
      isStaged,
      isUnstaged,
      isUntracked,
      isDeleted,
      isRenamed,
    });
  }

  return results;
}

/**
 * Extracts a deduplicated array of all workspace-relative paths from a list of changes.
 * For renamed files, includes both the new path and the old path so rules can match either.
 *
 * @param changes - Array of GitFileChange objects.
 * @returns Array of unique normalized paths.
 */
export function extractAllChangedPaths(changes: GitFileChange[]): string[] {
  const pathSet = new Set<string>();

  for (const change of changes) {
    pathSet.add(change.path);
    if (change.oldPath) {
      pathSet.add(change.oldPath);
    }
  }

  return Array.from(pathSet);
}
