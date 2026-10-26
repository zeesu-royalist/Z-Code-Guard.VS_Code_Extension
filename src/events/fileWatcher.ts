import * as vscode from 'vscode';
import * as path from 'path';
import { debounce } from '../utils/debounce';
import { scanWorkspaceCommand } from '../commands/scanWorkspace';
import { ResultsProvider } from '../views/resultsProvider';
import { CONFIG_FILE_NAME } from '../config/configSchema';

/**
 * Default delay in milliseconds for debouncing file change refreshes (600ms).
 * Gives enough time for rapid keypress saves or bulk file operations to settle.
 */
export const DEFAULT_REFRESH_DEBOUNCE_MS = 600;

/**
 * Determines whether a file URI represents a relevant workspace change.
 *
 * Rules:
 * - Scheme must be 'file' (ignores git:, output:, debug:, untitled:, etc.).
 * - Ignores internal Git repository metadata (e.g. .git/index, .git/HEAD).
 * - Ignores common operating system artifacts (e.g. .DS_Store).
 * - Accepts .z-code-guard.json so configuration edits update the results immediately.
 * - Must belong to an active workspace folder.
 *
 * @param uri - The file URI to check.
 */
export function isRelevantFileUri(uri: vscode.Uri): boolean {
  if (!uri || uri.scheme !== 'file') {
    return false;
  }

  const fsPath = uri.fsPath;
  if (!fsPath) {
    return false;
  }

  // Ignore internal Git operations and lock files
  if (
    fsPath.includes('/.git/') ||
    fsPath.includes('\\.git\\') ||
    fsPath.endsWith('/.git') ||
    fsPath.endsWith('\\.git')
  ) {
    return false;
  }

  // Ignore OS artifacts
  const baseName = path.basename(fsPath);
  if (baseName === '.DS_Store' || baseName === 'Thumbs.db') {
    return false;
  }

  // Ensure file belongs to an active workspace folder
  const folder = vscode.workspace.getWorkspaceFolder(uri);
  if (!folder) {
    return false;
  }

  return true;
}

/**
 * Determines if a file URI corresponds to the Z-Code-Guard configuration file.
 */
export function isConfigFileUri(uri: vscode.Uri): boolean {
  if (!uri || uri.scheme !== 'file') {
    return false;
  }
  return path.basename(uri.fsPath) === CONFIG_FILE_NAME;
}

export interface WatcherOptions {
  debounceDelayMs?: number;
}

/**
 * Subscribes to workspace document save, create, delete, and rename events.
 * Automatically triggers a debounced, silent workspace rescan to keep results fresh.
 *
 * All subscriptions and timers are bundled into a single Disposable for clean shutdown.
 *
 * @param resultsProvider - The Tree View provider to update.
 * @param options - Configuration options such as debounce delay.
 * @returns A composite vscode.Disposable.
 */
export function setupWorkspaceWatcher(
  resultsProvider: ResultsProvider,
  options?: WatcherOptions
): vscode.Disposable {
  const delayMs = options?.debounceDelayMs ?? DEFAULT_REFRESH_DEBOUNCE_MS;

  // Debounced scan function: batches rapid saves into a single scan
  const debouncedRefresh = debounce((targetFolder?: vscode.WorkspaceFolder) => {
    scanWorkspaceCommand(resultsProvider, { silent: true, targetFolder }).catch((err) => {
      console.error('Z-Code-Guard: Error during automatic workspace refresh:', err);
    });
  }, delayMs);

  // 1. Document Save listener
  const saveSub = vscode.workspace.onDidSaveTextDocument((document) => {
    if (isRelevantFileUri(document.uri)) {
      const folder = vscode.workspace.getWorkspaceFolder(document.uri);
      debouncedRefresh(folder);
    }
  });

  // 2. File Creation listener
  const createSub = vscode.workspace.onDidCreateFiles((event) => {
    const relevantUri = event.files.find((uri) => isRelevantFileUri(uri));
    if (relevantUri) {
      const folder = vscode.workspace.getWorkspaceFolder(relevantUri);
      debouncedRefresh(folder);
    }
  });

  // 3. File Deletion listener
  const deleteSub = vscode.workspace.onDidDeleteFiles((event) => {
    const relevantUri = event.files.find((uri) => isRelevantFileUri(uri));
    if (relevantUri) {
      const folder = vscode.workspace.getWorkspaceFolder(relevantUri);
      debouncedRefresh(folder);
    }
  });

  // 4. File Rename listener
  const renameSub = vscode.workspace.onDidRenameFiles((event) => {
    const relevantRename = event.files.find(
      (f) => isRelevantFileUri(f.newUri) || isRelevantFileUri(f.oldUri)
    );
    if (relevantRename) {
      const folder =
        vscode.workspace.getWorkspaceFolder(relevantRename.newUri) ||
        vscode.workspace.getWorkspaceFolder(relevantRename.oldUri);
      debouncedRefresh(folder);
    }
  });

  // Return composite disposable including event listeners and debounce timer
  return vscode.Disposable.from(
    saveSub,
    createSub,
    deleteSub,
    renameSub,
    { dispose: () => debouncedRefresh.dispose() }
  );
}
