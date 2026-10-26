import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { CONFIG_FILE_NAME, ZCodeGuardConfig } from '../config/configSchema';
import { readWorkspaceConfig, createStarterConfig } from '../config/configReader';

/**
 * Handles the "Z-Code-Guard: Configure Workspace" command.
 *
 * Guides the developer interactively:
 * - If `.z-code-guard.json` exists, opens it in the editor.
 * - If missing, offers common presets (Auth & Services, Core Business Logic, API & DB)
 *   and creates a starter configuration without overwriting anything.
 */
export async function configureWorkspaceCommand(): Promise<void> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    vscode.window.showWarningMessage(
      'Z-Code-Guard: No workspace folder is open. Please open a project first.'
    );
    return;
  }

  const folder =
    folders.length === 1
      ? folders[0]
      : await vscode.window.showWorkspaceFolderPick({
          placeHolder: 'Select a workspace folder to configure Z-Code-Guard',
        });

  if (!folder) {
    return;
  }

  const workspaceRoot = folder.uri.fsPath;
  const configResult = await readWorkspaceConfig(workspaceRoot);

  if (configResult.status !== 'missing') {
    // Already exists: open it for editing
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(configResult.configPath));
    await vscode.window.showTextDocument(doc);
    vscode.window.showInformationMessage(
      `Z-Code-Guard: Configuration file '${CONFIG_FILE_NAME}' is open for editing.`
    );
    return;
  }

  // File does not exist yet: offer interactive setup
  const presetChoice = await vscode.window.showQuickPick(
    [
      {
        label: '$(shield) Standard Protection Preset',
        description: 'src/auth/**, src/services/**, src/business-logic/**',
        patterns: ['src/auth/**', 'src/services/**', 'src/business-logic/**'],
      },
      {
        label: '$(database) Backend & API Preset',
        description: 'src/api/**, src/db/**, src/controllers/**',
        patterns: ['src/api/**', 'src/db/**', 'src/controllers/**'],
      },
      {
        label: '$(gear) Custom Starter Configuration',
        description: 'Create empty starter configuration to customize',
        patterns: ['src/protected/**'],
      },
    ],
    {
      placeHolder: 'Select protection rules to initialize .z-code-guard.json',
    }
  );

  if (!presetChoice) {
    return;
  }

  const configPath = path.join(workspaceRoot, CONFIG_FILE_NAME);
  const newConfig: ZCodeGuardConfig = {
    version: 1,
    protectedPaths: presetChoice.patterns,
    excludePaths: ['node_modules/**', 'dist/**', 'out/**', 'coverage/**'],
  };

  try {
    // Atomically write with exclusive flag to guarantee no overwrite
    await fs.promises.writeFile(
      configPath,
      JSON.stringify(newConfig, null, 2) + '\n',
      { flag: 'wx', encoding: 'utf8' }
    );

    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(configPath));
    await vscode.window.showTextDocument(doc);
    vscode.window.showInformationMessage(
      `Z-Code-Guard: Created '${CONFIG_FILE_NAME}' with selected protection rules.`
    );
  } catch (error: unknown) {
    const nodeErr = error as NodeJS.ErrnoException;
    if (nodeErr.code === 'EEXIST') {
      await createStarterConfig(workspaceRoot);
    } else {
      vscode.window.showErrorMessage(
        `Z-Code-Guard: Could not create configuration: ${nodeErr.message}`
      );
    }
  }
}
