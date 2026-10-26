import * as vscode from 'vscode';
import { createStarterConfig, readWorkspaceConfig } from '../config/configReader';
import { CONFIG_FILE_NAME } from '../config/configSchema';

/**
 * Resolves the target workspace folder.
 * If multiple folders are open, prompts the user to select one explicitly.
 */
async function resolveWorkspaceFolder(): Promise<vscode.WorkspaceFolder | undefined> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    vscode.window.showWarningMessage(
      'Z-Code-Guard: No workspace folder is open. Please open a project folder first.'
    );
    return undefined;
  }

  if (folders.length === 1) {
    return folders[0];
  }

  const selected = await vscode.window.showWorkspaceFolderPick({
    placeHolder: 'Select a workspace folder to open its Z-Code-Guard configuration',
  });

  return selected;
}

/**
 * Handles the "Z-Code-Guard: Open Configuration" command.
 *
 * If `.z-code-guard.json` exists, it opens the document in the editor and warns if
 * the file has validation or syntax errors.
 *
 * If missing, it prompts the user to create a starter configuration and opens it.
 * It will NEVER overwrite an existing configuration file.
 */
export async function openConfigurationCommand(): Promise<void> {
  const folder = await resolveWorkspaceFolder();
  if (!folder) {
    return;
  }

  const workspaceRoot = folder.uri.fsPath;
  const readResult = await readWorkspaceConfig(workspaceRoot);

  if (readResult.status === 'missing') {
    const choice = await vscode.window.showInformationMessage(
      `Configuration file '${CONFIG_FILE_NAME}' not found in '${folder.name}'. Would you like to create a starter configuration?`,
      'Create Starter Config',
      'Cancel'
    );

    if (choice === 'Create Starter Config') {
      const createResult = await createStarterConfig(workspaceRoot);
      if (createResult.created) {
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(createResult.configPath));
        await vscode.window.showTextDocument(doc);
        vscode.window.showInformationMessage(
          `Created '${CONFIG_FILE_NAME}'. You can now define your protected paths.`
        );
      } else {
        vscode.window.showErrorMessage(
          createResult.reason || `Failed to create '${CONFIG_FILE_NAME}'.`
        );
      }
    }
    return;
  }

  // The file exists on disk (valid, malformed, or invalid)
  const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(readResult.configPath));
  await vscode.window.showTextDocument(doc);

  if (readResult.status === 'malformed') {
    vscode.window.showWarningMessage(
      `Z-Code-Guard: Configuration file has invalid JSON syntax: ${readResult.rawError}`
    );
  } else if (readResult.status === 'invalid') {
    vscode.window.showWarningMessage(
      `Z-Code-Guard: Configuration validation warning: ${readResult.validationError}`
    );
  }
}
