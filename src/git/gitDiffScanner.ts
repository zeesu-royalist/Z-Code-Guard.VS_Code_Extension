import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { DEFAULT_GIT_TIMEOUT_MS, MAX_GIT_BUFFER_BYTES } from './gitScanner';

/**
 * Represents a single diff hunk containing changed line ranges and content.
 */
export interface GitDiffHunk {
  /** Old file starting line number */
  oldStart: number;
  /** Old file line count in hunk */
  oldCount: number;
  /** New file starting line number */
  newStart: number;
  /** New file line count in hunk */
  newCount: number;
  /** Raw hunk header (e.g. "@@ -10,5 +10,8 @@") */
  header: string;
  /** Added line numbers in the new file */
  addedLines: number[];
  /** Deleted line numbers in the old file */
  deletedLines: number[];
  /** Full lines of the hunk with '+', '-', or ' ' prefix */
  lines: string[];
}

/**
 * Complete diff information for a changed file.
 */
export interface GitFileDiff {
  /** Workspace-relative file path */
  path: string;
  /** Number of added lines */
  additions: number;
  /** Number of deleted lines */
  deletions: number;
  /** Parsed diff hunks */
  hunks: GitDiffHunk[];
  /** Raw unified diff output */
  rawDiff: string;
  /** True if this is a binary file where line diff is not applicable */
  isBinary: boolean;
}

/**
 * Per-file line count statistics.
 */
export interface FileLineStats {
  additions: number;
  deletions: number;
}

/**
 * Safely executes git with argument arrays.
 */
function executeGit(
  args: string[],
  cwd: string,
  timeoutMs: number = DEFAULT_GIT_TIMEOUT_MS
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    cp.execFile(
      'git',
      args,
      {
        cwd,
        timeout: timeoutMs,
        maxBuffer: MAX_GIT_BUFFER_BYTES,
        shell: false,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(Object.assign(error, { stdout, stderr }));
        } else {
          resolve({ stdout, stderr });
        }
      }
    );
  });
}

/**
 * Parses unified diff output into structured GitDiffHunk objects.
 *
 * @param rawDiff - Unified diff text from `git diff`.
 */
export function parseUnifiedDiff(rawDiff: string): GitDiffHunk[] {
  if (!rawDiff || rawDiff.trim().length === 0) {
    return [];
  }

  const hunks: GitDiffHunk[] = [];
  const lines = rawDiff.split('\n');

  let currentHunk: GitDiffHunk | null = null;
  let currentNewLine = 0;
  let currentOldLine = 0;

  const hunkHeaderRegex = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/;

  for (const line of lines) {
    const match = line.match(hunkHeaderRegex);
    if (match) {
      if (currentHunk) {
        hunks.push(currentHunk);
      }

      const oldStart = parseInt(match[1], 10);
      const oldCount = match[2] !== undefined ? parseInt(match[2], 10) : 1;
      const newStart = parseInt(match[3], 10);
      const newCount = match[4] !== undefined ? parseInt(match[4], 10) : 1;

      currentHunk = {
        oldStart,
        oldCount,
        newStart,
        newCount,
        header: line,
        addedLines: [],
        deletedLines: [],
        lines: [],
      };

      currentOldLine = oldStart;
      currentNewLine = newStart;
      continue;
    }

    if (!currentHunk) {
      continue;
    }

    currentHunk.lines.push(line);

    if (line.startsWith('+') && !line.startsWith('+++')) {
      currentHunk.addedLines.push(currentNewLine);
      currentNewLine++;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      currentHunk.deletedLines.push(currentOldLine);
      currentOldLine++;
    } else if (line.startsWith(' ')) {
      currentOldLine++;
      currentNewLine++;
    }
  }

  if (currentHunk) {
    hunks.push(currentHunk);
  }

  return hunks;
}

/**
 * Parses `git diff --numstat` output into a map of relative path -> additions & deletions.
 *
 * Format of numstat: `<additions>\t<deletions>\t<path>`
 * For binary files, additions and deletions are '-'
 */
export function parseNumstatOutput(numstatOutput: string): Map<string, FileLineStats> {
  const result = new Map<string, FileLineStats>();
  if (!numstatOutput || numstatOutput.trim().length === 0) {
    return result;
  }

  const lines = numstatOutput.split('\n');
  for (const line of lines) {
    const parts = line.split('\t');
    if (parts.length >= 3) {
      const addStr = parts[0].trim();
      const delStr = parts[1].trim();
      let filePath = parts.slice(2).join('\t').trim();

      // Handle rename format: {old => new} or similar
      if (filePath.includes(' => ')) {
        const renameMatch = filePath.match(/(?:.*\{.* => (.*)\}.*)|(?:.* => (.*))/);
        if (renameMatch) {
          filePath = (renameMatch[1] || renameMatch[2] || filePath).trim();
          filePath = filePath.replace(/[{}]/g, '');
        }
      }

      filePath = filePath.replace(/\\/g, '/');

      const additions = addStr === '-' ? 0 : parseInt(addStr, 10) || 0;
      const deletions = delStr === '-' ? 0 : parseInt(delStr, 10) || 0;

      const existing = result.get(filePath) || { additions: 0, deletions: 0 };
      result.set(filePath, {
        additions: existing.additions + additions,
        deletions: existing.deletions + deletions,
      });
    }
  }

  return result;
}

/**
 * Collects workspace-wide line addition and deletion counts from Git.
 * Queries both unstaged changes and staged changes.
 */
export async function getWorkspaceDiffStats(
  workspaceRoot: string
): Promise<Map<string, FileLineStats>> {
  const statsMap = new Map<string, FileLineStats>();

  try {
    // 1. Unstaged diff numstat
    const unstaged = await executeGit(['diff', '--numstat'], workspaceRoot);
    const unstagedStats = parseNumstatOutput(unstaged.stdout);
    for (const [p, s] of unstagedStats) {
      statsMap.set(p, { additions: s.additions, deletions: s.deletions });
    }
  } catch {
    // Gracefully continue if command fails
  }

  try {
    // 2. Staged diff numstat
    const staged = await executeGit(['diff', '--cached', '--numstat'], workspaceRoot);
    const stagedStats = parseNumstatOutput(staged.stdout);
    for (const [p, s] of stagedStats) {
      const existing = statsMap.get(p) || { additions: 0, deletions: 0 };
      statsMap.set(p, {
        additions: existing.additions + s.additions,
        deletions: existing.deletions + s.deletions,
      });
    }
  } catch {
    // Gracefully continue
  }

  return statsMap;
}

/**
 * Retrieves the full unified diff and parsed hunks for a specific file.
 * Handles staged changes, unstaged changes, untracked files, and deleted files.
 */
export async function getFileDiff(
  workspaceRoot: string,
  relativePath: string,
  options?: { isStaged?: boolean; isUntracked?: boolean; isDeleted?: boolean }
): Promise<GitFileDiff> {
  const normPath = relativePath.replace(/\\/g, '/');

  // Handle untracked files: read entire content from disk as added lines
  if (options?.isUntracked) {
    const fullPath = path.isAbsolute(normPath) ? normPath : path.join(workspaceRoot, normPath);
    try {
      const content = await fs.promises.readFile(fullPath, 'utf8');
      let lines = content.split(/\r?\n/);
      if (lines.length > 0 && lines[lines.length - 1] === '') {
        lines.pop();
      }
      const addedLines = lines.map((_, idx) => idx + 1);
      const hunkLines = lines.map((l) => `+${l}`);

      const hunk: GitDiffHunk = {
        oldStart: 0,
        oldCount: 0,
        newStart: 1,
        newCount: lines.length,
        header: `@@ -0,0 +1,${lines.length} @@ (untracked file)`,
        addedLines,
        deletedLines: [],
        lines: hunkLines,
      };

      return {
        path: normPath,
        additions: lines.length,
        deletions: 0,
        hunks: [hunk],
        rawDiff: `${hunk.header}\n${hunkLines.join('\n')}`,
        isBinary: false,
      };
    } catch {
      return {
        path: normPath,
        additions: 0,
        deletions: 0,
        hunks: [],
        rawDiff: '',
        isBinary: false,
      };
    }
  }

  // Handle tracked files: query Git diff
  try {
    const diffArgs = options?.isStaged
      ? ['diff', '--cached', '-U3', '--', normPath]
      : ['diff', 'HEAD', '-U3', '--', normPath];

    let { stdout } = await executeGit(diffArgs, workspaceRoot);

    // If diff HEAD failed (e.g. initial commit repository with no HEAD yet)
    if (!stdout && !options?.isStaged) {
      try {
        const fallback = await executeGit(['diff', '-U3', '--', normPath], workspaceRoot);
        stdout = fallback.stdout;
      } catch {
        // keep empty
      }
    }

    const isBinary = stdout.includes('Binary files');
    const hunks = isBinary ? [] : parseUnifiedDiff(stdout);

    let additions = 0;
    let deletions = 0;
    for (const h of hunks) {
      additions += h.addedLines.length;
      deletions += h.deletedLines.length;
    }

    return {
      path: normPath,
      additions,
      deletions,
      hunks,
      rawDiff: stdout,
      isBinary,
    };
  } catch (error: unknown) {
    return {
      path: normPath,
      additions: 0,
      deletions: 0,
      hunks: [],
      rawDiff: '',
      isBinary: false,
    };
  }
}
