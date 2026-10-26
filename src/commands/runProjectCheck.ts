import * as vscode from 'vscode';
import * as cp from 'child_process';
import { ProjectCheck } from '../models/scanResult';

let checkOutputChannel: vscode.OutputChannel | undefined;

/**
 * Handles executing a discovered project validation check with explicit user consent.
 *
 * CRITICAL SAFETY RULES:
 * 1. Checks require explicit invocation.
 * 2. Commands are confirmed before execution.
 * 3. Output is logged safely to a dedicated Output Channel.
 *
 * @param check - ProjectCheck item to execute.
 * @param workspaceRoot - Workspace root where check command will run.
 */
export async function runProjectCheckCommand(
  check?: ProjectCheck,
  workspaceRoot?: string
): Promise<void> {
  const folders = vscode.workspace.workspaceFolders;
  const root =
    workspaceRoot ||
    (folders && folders.length > 0 ? folders[0].uri.fsPath : undefined);

  if (!root) {
    vscode.window.showWarningMessage('Z-Code-Guard: No workspace folder open.');
    return;
  }

  if (!check) {
    vscode.window.showInformationMessage('Z-Code-Guard: Select a check from the Validation Checks section.');
    return;
  }

  const confirm = await vscode.window.showInformationMessage(
    `Execute project check: '${check.command}' in '${root}'?`,
    'Run Check',
    'Cancel'
  );

  if (confirm !== 'Run Check') {
    return;
  }

  if (!checkOutputChannel) {
    checkOutputChannel = vscode.window.createOutputChannel('Z-Code-Guard Validation');
  }

  checkOutputChannel.show(true);
  checkOutputChannel.appendLine(`\n=== Running: ${check.command} ===`);
  checkOutputChannel.appendLine(`Working Directory: ${root}`);
  checkOutputChannel.appendLine(`Timestamp: ${new Date().toLocaleTimeString()}\n`);

  vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Z-Code-Guard: Running ${check.name}...`,
      cancellable: false,
    },
    () => {
      return new Promise<void>((resolve) => {
        const parts = check.command.split(' ');
        const bin = parts[0];
        const args = parts.slice(1);

        cp.execFile(
          bin,
          args,
          { cwd: root, shell: true, timeout: 60000 },
          (error, stdout, stderr) => {
            if (stdout) {
              checkOutputChannel?.append(stdout);
            }
            if (stderr) {
              checkOutputChannel?.append(stderr);
            }

            if (error) {
              checkOutputChannel?.appendLine(`\nFAILED with exit code: ${error.code || 1}`);
              vscode.window.showErrorMessage(
                `Z-Code-Guard: Check '${check.name}' failed. See Output Channel for details.`
              );
            } else {
              checkOutputChannel?.appendLine(`\nPASSED successfully.`);
              vscode.window.showInformationMessage(
                `Z-Code-Guard: Check '${check.name}' passed successfully.`
              );
            }
            resolve();
          }
        );
      });
    }
  );
}
