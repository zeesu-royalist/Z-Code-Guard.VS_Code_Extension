import * as vscode from 'vscode';
import { baselineStore, recordCurrentBaseline } from '../analysis/diagnosticsTracker';
import { ResultsProvider } from '../views/resultsProvider';
import { scanWorkspaceCommand } from './scanWorkspace';

/**
 * Handles the "Z-Code-Guard: Record Baseline" command.
 *
 * Records a snapshot of current diagnostics and errors as the baseline.
 * If a baseline already exists, requests confirmation before replacing it.
 */
export async function recordBaselineCommand(resultsProvider?: ResultsProvider): Promise<void> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    vscode.window.showWarningMessage('Z-Code-Guard: No workspace folder open.');
    return;
  }

  const workspaceRoot = folders[0].uri.fsPath;

  if (baselineStore.hasBaseline(workspaceRoot)) {
    const choice = await vscode.window.showWarningMessage(
      'A diagnostics baseline is already recorded for this workspace. Do you want to replace it with the current state?',
      'Replace Baseline',
      'Cancel'
    );
    if (choice !== 'Replace Baseline') {
      return;
    }
  }

  const { count, errors, warnings } = recordCurrentBaseline(workspaceRoot);

  vscode.window.showInformationMessage(
    `Z-Code-Guard: Baseline recorded with ${count} diagnostic(s) (${errors} error(s), ${warnings} warning(s)). Subsequent scans will compare against this snapshot.`
  );

  // Rescan silently to update tree view statuses with new baseline
  if (resultsProvider) {
    await scanWorkspaceCommand(resultsProvider, { silent: true });
  }
}
