import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ChangedFile } from '../models/scanResult';

/**
 * Handles the "Z-Code-Guard: View Diff" command.
 *
 * Opens VS Code's native side-by-side diff editor (`vscode.diff`) to compare
 * the working file with the Git index or HEAD.
 *
 * Safe and local-first:
 * - Uses VS Code's native `vscode.diff` command.
 * - Handles untracked files (opens file), deleted files, and modified files.
 *
 * @param workspaceRoot - Absolute path to workspace root.
 * @param changedFileOrPath - ChangedFile object or relative file path string.
 */
export async function viewDiffCommand(
  workspaceRoot?: string,
  changedFileOrPath?: ChangedFile | string
): Promise<void> {
  const root =
    workspaceRoot ||
    (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
      ? vscode.workspace.workspaceFolders[0].uri.fsPath
      : undefined);

  if (!root) {
    vscode.window.showWarningMessage('Z-Code-Guard: No workspace folder open.');
    return;
  }

  let relativePath: string | undefined;
  let isUntracked = false;
  let isDeleted = false;

  if (typeof changedFileOrPath === 'string') {
    relativePath = changedFileOrPath;
  } else if (changedFileOrPath) {
    relativePath = changedFileOrPath.path;
    isUntracked = changedFileOrPath.isUntracked;
    isDeleted = changedFileOrPath.isDeleted;
  }

  if (!relativePath) {
    // If called from Command Palette without arguments, prompt user
    vscode.window.showInformationMessage('Z-Code-Guard: Select a changed file in the Results view to view its diff.');
    return;
  }

  const fullPath = path.isAbsolute(relativePath)
    ? relativePath
    : path.join(root, relativePath);

  // Untracked files have no previous Git version to diff against
  if (isUntracked) {
    if (!fs.existsSync(fullPath)) {
      vscode.window.showWarningMessage(`Z-Code-Guard: File does not exist: ${relativePath}`);
      return;
    }
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(fullPath));
    await vscode.window.showTextDocument(doc);
    vscode.window.showInformationMessage(
      `Z-Code-Guard: '${relativePath}' is untracked (new file). Opened in editor.`
    );
    return;
  }

  // Deleted files
  if (isDeleted) {
    vscode.window.showInformationMessage(
      `Z-Code-Guard: '${relativePath}' was deleted from the working tree.`
    );
    return;
  }

  if (!fs.existsSync(fullPath)) {
    vscode.window.showWarningMessage(`Z-Code-Guard: File does not exist on disk: ${relativePath}`);
    return;
  }

  const fileUri = vscode.Uri.file(fullPath);

  try {
    // Attempt to use VS Code built-in Git extension URI if available (git:/...~HEAD)
    // or git diff provider URI
    const headUri = fileUri.with({ scheme: 'git', query: 'ref=HEAD' });
    const title = `${path.basename(relativePath)} (Working Tree ↔ HEAD)`;

    try {
      await vscode.commands.executeCommand('vscode.diff', headUri, fileUri, title);
    } catch {
      // Fallback: open text document directly if git scheme provider is unavailable
      const doc = await vscode.workspace.openTextDocument(fileUri);
      await vscode.window.showTextDocument(doc);
    }
  } catch (error: unknown) {
    const err = error as Error;
    vscode.window.showErrorMessage(
      `Z-Code-Guard: Unable to open diff for '${relativePath}': ${err.message}`
    );
  }
}
