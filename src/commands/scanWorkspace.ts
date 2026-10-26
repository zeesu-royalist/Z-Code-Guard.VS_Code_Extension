import * as vscode from 'vscode';
import { performScan } from '../analysis/scanService';
import { ResultsProvider } from '../views/resultsProvider';
import { ScanResult } from '../models/scanResult';

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
    placeHolder: 'Select a workspace folder to scan with Z-Code-Guard',
  });

  return selected;
}

export interface ScanWorkspaceOptions {
  /**
   * If true, suppresses toast notifications (used for automatic background refreshes).
   */
  silent?: boolean;

  /**
   * Specific workspace folder to scan. If omitted, prompts user or uses single root.
   */
  targetFolder?: vscode.WorkspaceFolder;

  /**
   * If true, allows scanning without .z-code-guard.json.
   */
  allowUnconfigured?: boolean;
}

/**
 * Handles the "Z-Code-Guard: Scan Workspace" command.
 *
 * Runs the scan service against the selected workspace folder,
 * updates the Results Tree View, and notifies the user (unless silent option is set).
 */
export async function scanWorkspaceCommand(
  resultsProvider?: ResultsProvider,
  options?: ScanWorkspaceOptions
): Promise<ScanResult | undefined> {
  const folder = options?.targetFolder || (await resolveWorkspaceFolder());
  if (!folder) {
    return undefined;
  }

  const workspaceRoot = folder.uri.fsPath;
  const result = await performScan(workspaceRoot, {
    allowUnconfigured: options?.allowUnconfigured,
  });

  if (resultsProvider) {
    resultsProvider.setScanResult(result, workspaceRoot);
  }

  // If running silently (e.g. background event auto-refresh), don't pop up toasts
  if (options?.silent) {
    return result;
  }

  if (result.status === 'error') {
    if (result.errorCode === 'CONFIG_MISSING') {
      const choice = await vscode.window.showWarningMessage(
        `Z-Code-Guard: ${result.message}`,
        'Create Configuration',
        'Scan Without Config',
        'Dismiss'
      );
      if (choice === 'Create Configuration') {
        await vscode.commands.executeCommand('z-code-guard.openConfiguration');
      } else if (choice === 'Scan Without Config') {
        return scanWorkspaceCommand(resultsProvider, {
          ...options,
          allowUnconfigured: true,
        });
      }
    } else {
      vscode.window.showErrorMessage(`Z-Code-Guard: ${result.message}`);
    }
    return result;
  }

  // Scan succeeded
  if (result.protectedCount > 0) {
    vscode.window.showWarningMessage(
      `Z-Code-Guard: ${result.protectedCount} protected file(s) changed (${result.totalCount} total changes).`
    );
  } else if (result.totalCount > 0) {
    vscode.window.showInformationMessage(
      `Z-Code-Guard: ${result.totalCount} change(s) found. None match protected paths.`
    );
  } else {
    vscode.window.showInformationMessage('Z-Code-Guard: No Git changes found in workspace.');
  }

  return result;
}
