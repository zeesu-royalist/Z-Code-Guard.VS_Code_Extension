import * as cp from 'child_process';
import { GitFileChange, parseGitStatus } from './gitStatusParser';

/**
 * Default timeout for Git operations in milliseconds (10 seconds).
 */
export const DEFAULT_GIT_TIMEOUT_MS = 10000;

/**
 * Maximum output buffer for Git status (10 megabytes).
 * Accommodates repositories with thousands of changed or untracked files.
 */
export const MAX_GIT_BUFFER_BYTES = 10 * 1024 * 1024;

/**
 * Returned when Git is successfully queried and changes are parsed.
 */
export interface GitScanSuccess {
  status: 'success';
  isGitInstalled: true;
  isGitRepository: true;
  repositoryRoot: string;
  rawStatus: string;
  changes: GitFileChange[];
}

/**
 * Returned when Git is not installed or not found on the system PATH.
 */
export interface GitScanGitMissing {
  status: 'git_missing';
  isGitInstalled: false;
  isGitRepository: false;
  message: string;
}

/**
 * Returned when the workspace is not inside a Git repository.
 */
export interface GitScanNotARepository {
  status: 'not_a_repository';
  isGitInstalled: true;
  isGitRepository: false;
  message: string;
}

/**
 * Returned when the Git command failed unexpectedly (e.g. process timeout, lock file).
 */
export interface GitScanCommandFailed {
  status: 'command_failed';
  isGitInstalled: true;
  isGitRepository: boolean;
  message: string;
  exitCode?: number;
  stderr?: string;
}

export type GitScanResult =
  | GitScanSuccess
  | GitScanGitMissing
  | GitScanNotARepository
  | GitScanCommandFailed;

/**
 * Helper to execute a Git CLI command safely using child_process.execFile.
 *
 * CRITICAL SAFETY RULES:
 * 1. Uses explicit argument arrays (never shell string concatenation).
 * 2. shell: false is enforced to prevent shell injection.
 * 3. Reasonable timeouts prevent hanging if Git waits for credentials or locks.
 *
 * @param args - Array of command-line arguments to pass to git.
 * @param cwd - The working directory in which to execute the command.
 * @param timeoutMs - Maximum execution time before aborting.
 */
function executeGit(
  args: string[],
  cwd?: string,
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
 * Checks if the Git executable is installed and available on PATH.
 */
export async function checkGitInstalled(): Promise<{
  installed: boolean;
  version?: string;
}> {
  try {
    const { stdout } = await executeGit(['--version'], undefined, 5000);
    return {
      installed: true,
      version: stdout.trim(),
    };
  } catch (error: unknown) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === 'ENOENT') {
      return { installed: false };
    }
    // If git returned an error code, it still exists on PATH
    return { installed: true };
  }
}

/**
 * Checks if the given workspace folder is inside a Git repository.
 *
 * @param workspaceRoot - Absolute path to the workspace folder.
 */
export async function checkIsGitRepository(workspaceRoot: string): Promise<{
  isRepo: boolean;
  repositoryRoot?: string;
  error?: string;
}> {
  try {
    const { stdout } = await executeGit(
      ['rev-parse', '--show-toplevel'],
      workspaceRoot,
      5000
    );
    return {
      isRepo: true,
      repositoryRoot: stdout.trim(),
    };
  } catch (error: unknown) {
    const execError = error as { stderr?: string; message?: string };
    const errorText = execError.stderr || execError.message || '';
    return {
      isRepo: false,
      error: errorText.trim(),
    };
  }
}

/**
 * Scans the workspace using local Git commands to discover changed, staged,
 * deleted, renamed, and untracked files.
 *
 * Safe and non-destructive: Does NOT alter working tree, index, or history.
 *
 * @param workspaceRoot - Absolute path to the workspace root directory.
 */
export async function scanGitStatus(
  workspaceRoot: string,
  timeoutMs: number = DEFAULT_GIT_TIMEOUT_MS
): Promise<GitScanResult> {
  // 1. Verify Git CLI is installed
  const gitCheck = await checkGitInstalled();
  if (!gitCheck.installed) {
    return {
      status: 'git_missing',
      isGitInstalled: false,
      isGitRepository: false,
      message:
        'Git CLI is not installed or was not found on your system PATH. Please install Git to use Z-Code-Guard.',
    };
  }

  // 2. Verify workspace is inside a Git repository
  const repoCheck = await checkIsGitRepository(workspaceRoot);
  if (!repoCheck.isRepo) {
    return {
      status: 'not_a_repository',
      isGitInstalled: true,
      isGitRepository: false,
      message: `The folder '${workspaceRoot}' is not a Git repository. Please open a Git repository or initialize one with 'git init'.`,
    };
  }

  const repositoryRoot = repoCheck.repositoryRoot || workspaceRoot;

  // 3. Query machine-readable status
  // -porcelain=v1: Stable script-friendly status format
  // -z: NUL-delimited fields to preserve filenames with spaces and special characters
  // --untracked-files=all: Lists individual untracked files rather than collapsing whole directories
  try {
    const { stdout } = await executeGit(
      ['status', '--porcelain=v1', '-z', '--untracked-files=all'],
      workspaceRoot,
      timeoutMs
    );

    const changes = parseGitStatus(stdout);

    return {
      status: 'success',
      isGitInstalled: true,
      isGitRepository: true,
      repositoryRoot,
      rawStatus: stdout,
      changes,
    };
  } catch (error: unknown) {
    const execError = error as {
      code?: number | string;
      killed?: boolean;
      stderr?: string;
      message?: string;
    };

    if (execError.killed) {
      return {
        status: 'command_failed',
        isGitInstalled: true,
        isGitRepository: true,
        message: `Git status timed out after ${timeoutMs}ms. The repository may be locked or undergoing a long-running operation.`,
      };
    }

    return {
      status: 'command_failed',
      isGitInstalled: true,
      isGitRepository: true,
      message: `Git status failed: ${execError.stderr || execError.message || 'Unknown error'}`,
      exitCode: typeof execError.code === 'number' ? execError.code : undefined,
      stderr: execError.stderr,
    };
  }
}
