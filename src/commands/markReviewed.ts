import * as vscode from 'vscode';
import { reviewManager } from '../analysis/reviewManager';
import { ResultsProvider } from '../views/resultsProvider';
import { scanWorkspaceCommand } from './scanWorkspace';

/**
 * Handles toggling reviewed status for a changed file.
 *
 * @param relativePath - Relative path to the file.
 * @param resultsProvider - Tree View provider to update.
 */
export async function toggleReviewedCommand(
  relativePath?: string,
  resultsProvider?: ResultsProvider
): Promise<void> {
  if (!relativePath) {
    return;
  }

  const isReviewed = reviewManager.toggleReviewed(relativePath);

  if (isReviewed) {
    vscode.window.showInformationMessage(
      `Z-Code-Guard: Marked '${relativePath}' as reviewed for this session.`
    );
  } else {
    vscode.window.showInformationMessage(
      `Z-Code-Guard: Unmarked '${relativePath}'.`
    );
  }

  if (resultsProvider) {
    await scanWorkspaceCommand(resultsProvider, { silent: true });
  }
}
