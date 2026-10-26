import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { openConfigurationCommand } from './commands/openConfiguration';
import { scanWorkspaceCommand } from './commands/scanWorkspace';
import { viewDiffCommand } from './commands/viewDiff';
import { configureWorkspaceCommand } from './commands/configureWorkspace';
import { recordBaselineCommand } from './commands/recordBaseline';
import { toggleReviewedCommand } from './commands/markReviewed';
import { openAtLineCommand } from './commands/openAtLine';
import { runProjectCheckCommand } from './commands/runProjectCheck';
import { ResultsProvider, ResultTreeItem } from './views/resultsProvider';
import { setupWorkspaceWatcher } from './events/fileWatcher';

/**
 * This method is called when your extension is activated.
 * Activation occurs when one of the registered activation events is triggered,
 * or when the user invokes a command contributed by this extension.
 *
 * @param context - VS Code extension context used to register subscriptions and manage lifecycle.
 */
export function activate(context: vscode.ExtensionContext): void {
  console.log('Z-Code-Guard extension is now active.');

  // Initialize the Tree Data Provider for results
  const resultsProvider = new ResultsProvider();

  // Register the Tree View in the Activity Bar container
  const treeView = vscode.window.createTreeView('zCodeGuardResults', {
    treeDataProvider: resultsProvider,
    showCollapseAll: true,
  });

  // Set up debounced workspace file watchers for save, create, delete, and rename events
  const watcherDisposable = setupWorkspaceWatcher(resultsProvider);

  // 1. "Z-Code-Guard: Scan Workspace" command
  const scanCommandDisposable = vscode.commands.registerCommand(
    'z-code-guard.scanWorkspace',
    () => scanWorkspaceCommand(resultsProvider)
  );

  // 2. "Z-Code-Guard: Scan Without Configuration" command
  const scanUnconfiguredDisposable = vscode.commands.registerCommand(
    'z-code-guard.scanWorkspaceUnconfigured',
    () => scanWorkspaceCommand(resultsProvider, { allowUnconfigured: true })
  );

  // 3. "Z-Code-Guard: Open Configuration" command
  const openConfigCommandDisposable = vscode.commands.registerCommand(
    'z-code-guard.openConfiguration',
    openConfigurationCommand
  );

  // 4. "Z-Code-Guard: Configure Workspace" command
  const configureWorkspaceDisposable = vscode.commands.registerCommand(
    'z-code-guard.configureWorkspace',
    configureWorkspaceCommand
  );

  // 5. "Z-Code-Guard: View Diff" command
  const viewDiffDisposable = vscode.commands.registerCommand(
    'z-code-guard.viewDiff',
    (workspaceRootOrItem?: string | ResultTreeItem, relativePath?: string) => {
      if (typeof workspaceRootOrItem === 'object' && workspaceRootOrItem !== null) {
        return viewDiffCommand(
          workspaceRootOrItem.workspaceRoot,
          workspaceRootOrItem.filePath
        );
      }
      return viewDiffCommand(workspaceRootOrItem, relativePath);
    }
  );

  // 6. "Z-Code-Guard: Record Diagnostics Baseline" command
  const recordBaselineDisposable = vscode.commands.registerCommand(
    'z-code-guard.recordBaseline',
    () => recordBaselineCommand(resultsProvider)
  );

  // 7. "Z-Code-Guard: Toggle Reviewed" command
  const toggleReviewedDisposable = vscode.commands.registerCommand(
    'z-code-guard.toggleReviewed',
    (itemOrPath?: ResultTreeItem | string) => {
      const relPath =
        typeof itemOrPath === 'string'
          ? itemOrPath
          : itemOrPath?.filePath;
      return toggleReviewedCommand(relPath, resultsProvider);
    }
  );

  // 8. "Z-Code-Guard: Open File at Line" command
  const openAtLineDisposable = vscode.commands.registerCommand(
    'z-code-guard.openAtLine',
    (workspaceRoot?: string, relativePath?: string, line?: number) =>
      openAtLineCommand(workspaceRoot, relativePath, line)
  );

  // 9. "Z-Code-Guard: Run Project Check" command
  const runCheckDisposable = vscode.commands.registerCommand(
    'z-code-guard.runCheck',
    (check?: import('./models/scanResult').ProjectCheck, workspaceRoot?: string) =>
      runProjectCheckCommand(check, workspaceRoot)
  );

  // 10. Command to open a changed file in the editor
  const openFileCommandDisposable = vscode.commands.registerCommand(
    'z-code-guard.openFile',
    async (workspaceRoot?: string, relativePath?: string) => {
      if (!relativePath) {
        return;
      }

      const fullPath =
        workspaceRoot && !path.isAbsolute(relativePath)
          ? path.join(workspaceRoot, relativePath)
          : relativePath;

      if (!fs.existsSync(fullPath)) {
        vscode.window.showWarningMessage(
          `Z-Code-Guard: File no longer exists on disk: ${relativePath}`
        );
        return;
      }

      try {
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(fullPath));
        await vscode.window.showTextDocument(doc);
      } catch (err: unknown) {
        const error = err as Error;
        vscode.window.showErrorMessage(
          `Z-Code-Guard: Unable to open file '${relativePath}': ${error.message}`
        );
      }
    }
  );

  // 11. Notification command for deleted files
  const showDeletedNoticeDisposable = vscode.commands.registerCommand(
    'z-code-guard.showDeletedNotice',
    (relativePath: string) => {
      vscode.window.showInformationMessage(
        `Z-Code-Guard: '${relativePath}' was deleted from the repository.`
      );
    }
  );

  // Add all disposables to subscriptions for automatic cleanup
  context.subscriptions.push(treeView);
  context.subscriptions.push(watcherDisposable);
  context.subscriptions.push(scanCommandDisposable);
  context.subscriptions.push(scanUnconfiguredDisposable);
  context.subscriptions.push(openConfigCommandDisposable);
  context.subscriptions.push(configureWorkspaceDisposable);
  context.subscriptions.push(viewDiffDisposable);
  context.subscriptions.push(recordBaselineDisposable);
  context.subscriptions.push(toggleReviewedDisposable);
  context.subscriptions.push(openAtLineDisposable);
  context.subscriptions.push(runCheckDisposable);
  context.subscriptions.push(openFileCommandDisposable);
  context.subscriptions.push(showDeletedNoticeDisposable);
}

/**
 * This method is called when your extension is deactivated.
 * Clean up any resources, timers, or processes here.
 */
export function deactivate(): void {
  // Disposables registered in context.subscriptions are automatically cleaned up
}
