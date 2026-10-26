import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Handles opening a file in the editor and revealing a specific line number.
 *
 * @param workspaceRoot - Workspace root path.
 * @param relativePath - Relative path to file.
 * @param line - 1-based line number.
 */
export async function openAtLineCommand(
  workspaceRoot?: string,
  relativePath?: string,
  line?: number
): Promise<void> {
  if (!relativePath) {
    return;
  }

  const root =
    workspaceRoot ||
    (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
      ? vscode.workspace.workspaceFolders[0].uri.fsPath
      : '');

  const fullPath =
    root && !path.isAbsolute(relativePath) ? path.join(root, relativePath) : relativePath;

  if (!fs.existsSync(fullPath)) {
    vscode.window.showWarningMessage(`Z-Code-Guard: File does not exist: ${relativePath}`);
    return;
  }

  try {
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(fullPath));
    const targetLine = Math.max(0, (line || 1) - 1);
    const pos = new vscode.Position(targetLine, 0);
    const range = new vscode.Range(pos, pos);

    await vscode.window.showTextDocument(doc, {
      selection: range,
    });
  } catch (error: unknown) {
    const err = error as Error;
    vscode.window.showErrorMessage(
      `Z-Code-Guard: Unable to open file '${relativePath}': ${err.message}`
    );
  }
}
