import * as path from 'path';
import { readWorkspaceConfig } from '../config/configReader';
import { ZCodeGuardConfig } from '../config/configSchema';
import { scanGitStatus } from '../git/gitScanner';
import { getFileDiff, getWorkspaceDiffStats } from '../git/gitDiffScanner';
import { ChangedFile, ScanResult } from '../models/scanResult';
import { classifyFile } from './pathMatcher';
import { identifyChangedSymbols } from './symbolAnalyzer';
import { analyzeWorkspaceImpact } from './impactAnalyzer';
import { collectWorkspaceDiagnostics, compareWithBaseline } from './diagnosticsTracker';
import { evaluateRiskFindings } from './riskEngine';
import { discoverProjectChecks } from './projectChecks';
import { reviewManager } from './reviewManager';

export interface ScanOptions {
  /**
   * If true, permits scanning without .z-code-guard.json by applying sensible defaults.
   */
  allowUnconfigured?: boolean;

  /**
   * If false, skips symbol analysis (e.g. for rapid lightweight checks). Defaults to true.
   */
  enableSymbols?: boolean;

  /**
   * If false, skips impact analysis. Defaults to true.
   */
  enableImpact?: boolean;

  /**
   * If false, skips diagnostic collection. Defaults to true.
   */
  enableDiagnostics?: boolean;
}

/**
 * Default fallback configuration when running in unconfigured mode.
 */
const DEFAULT_UNCONFIGURED_CONFIG: ZCodeGuardConfig = {
  version: 1,
  protectedPaths: [],
  excludePaths: ['node_modules/**', 'dist/**', 'out/**', 'build/**', '.git/**'],
};

/**
 * Coordinates workspace configuration loading, local Git status scanning,
 * line-level diff collection, AST symbol identification, impact analysis,
 * diagnostics tracking, and evidence-based risk evaluation.
 *
 * Safe and local-first:
 * - Does not make external network requests.
 * - Does not modify, stage, or revert files.
 * - Retains explicit error states rather than falsely reporting 'no changes'.
 *
 * @param workspaceRoot - Absolute path to the workspace root directory.
 * @param options - Optional configuration options.
 */
export async function performScan(
  workspaceRoot: string,
  options?: ScanOptions
): Promise<ScanResult> {
  const scannedAt = new Date().toISOString();

  // 1. Verify workspaceRoot is provided
  if (!workspaceRoot || workspaceRoot.trim().length === 0) {
    return {
      workspaceRoot: '',
      scannedAt,
      status: 'error',
      changedFiles: [],
      protectedCount: 0,
      totalCount: 0,
      message: 'No workspace folder provided for scanning.',
      errorCode: 'NO_WORKSPACE',
    };
  }

  // 2. Read and validate project configuration
  let config: ZCodeGuardConfig = DEFAULT_UNCONFIGURED_CONFIG;
  let isConfigured = false;

  const configResult = await readWorkspaceConfig(workspaceRoot);

  if (configResult.status === 'missing') {
    if (!options?.allowUnconfigured) {
      return {
        workspaceRoot,
        scannedAt,
        status: 'error',
        changedFiles: [],
        protectedCount: 0,
        totalCount: 0,
        message: configResult.message,
        errorCode: 'CONFIG_MISSING',
      };
    }
    // allowUnconfigured is true: proceed with sensible defaults
    config = DEFAULT_UNCONFIGURED_CONFIG;
    isConfigured = false;
  } else if (configResult.status === 'malformed' || configResult.status === 'invalid') {
    return {
      workspaceRoot,
      scannedAt,
      status: 'error',
      changedFiles: [],
      protectedCount: 0,
      totalCount: 0,
      message: configResult.message,
      errorCode: 'CONFIG_INVALID',
    };
  } else {
    config = configResult.config;
    isConfigured = true;
  }

  // 3. Scan local Git changes
  const gitResult = await scanGitStatus(workspaceRoot);

  if (gitResult.status === 'git_missing') {
    return {
      workspaceRoot,
      scannedAt,
      status: 'error',
      changedFiles: [],
      protectedCount: 0,
      totalCount: 0,
      message: gitResult.message,
      errorCode: 'GIT_NOT_INSTALLED',
    };
  }

  if (gitResult.status === 'not_a_repository') {
    return {
      workspaceRoot,
      scannedAt,
      status: 'error',
      changedFiles: [],
      protectedCount: 0,
      totalCount: 0,
      message: gitResult.message,
      errorCode: 'NOT_A_GIT_REPO',
    };
  }

  if (gitResult.status === 'command_failed') {
    return {
      workspaceRoot,
      scannedAt,
      status: 'error',
      changedFiles: [],
      protectedCount: 0,
      totalCount: 0,
      message: gitResult.message,
      errorCode: 'GIT_COMMAND_FAILED',
    };
  }

  // 4. Fetch workspace line addition/deletion stats
  const diffStats = await getWorkspaceDiffStats(workspaceRoot);

  // 5. Classify changes and apply exclusions
  const changedFiles: ChangedFile[] = [];

  for (const gitChange of gitResult.changes) {
    const classification = classifyFile(gitChange, config);
    if (!classification.isExcluded && classification.changedFile) {
      const file = classification.changedFile;

      // Add line stats
      const stats = diffStats.get(file.path);
      if (stats) {
        file.additions = stats.additions;
        file.deletions = stats.deletions;
      }

      // Retrieve full unified diff and hunks
      const fileDiff = await getFileDiff(workspaceRoot, file.path, {
        isStaged: file.isStaged,
        isUntracked: file.isUntracked,
        isDeleted: file.isDeleted,
      });
      file.diff = fileDiff;

      if (file.additions === undefined) {
        file.additions = fileDiff.additions;
      }
      if (file.deletions === undefined) {
        file.deletions = fileDiff.deletions;
      }

      // Check review status
      file.isReviewed = reviewManager.isReviewed(file.path);

      changedFiles.push(file);
    }
  }

  // 6. Code-level symbol analysis
  const enableSymbols = options?.enableSymbols !== false;
  if (enableSymbols) {
    for (const file of changedFiles) {
      if (!file.isDeleted && file.diff && file.diff.hunks.length > 0) {
        const fullPath = path.join(workspaceRoot, file.path);
        try {
          const symbols = await identifyChangedSymbols(file.path, fullPath, file.diff.hunks);
          file.symbols = symbols;
        } catch {
          file.symbols = [];
        }
      }
    }
  }

  // 7. Impact analysis for changed exported symbols
  const enableImpact = options?.enableImpact !== false;
  if (enableImpact && changedFiles.length > 0) {
    try {
      const impactMap = await analyzeWorkspaceImpact(workspaceRoot, changedFiles);
      for (const file of changedFiles) {
        file.impactReferences = impactMap.get(file.path) || [];
      }
    } catch {
      // Continue gracefully if impact analysis has issues
    }
  }

  // 8. Diagnostics collection & regression detection
  const enableDiagnostics = options?.enableDiagnostics !== false;
  let diagnosticsSummary = {
    newErrorsCount: 0,
    newWarningsCount: 0,
    preExistingErrorsCount: 0,
    resolvedCount: 0,
  };

  if (enableDiagnostics) {
    try {
      const rawDiags = collectWorkspaceDiagnostics(workspaceRoot);
      const comparison = compareWithBaseline(workspaceRoot, rawDiags);

      diagnosticsSummary = {
        newErrorsCount: comparison.newErrorsCount,
        newWarningsCount: comparison.newWarningsCount,
        preExistingErrorsCount: comparison.preExistingErrorsCount,
        resolvedCount: comparison.resolvedCount,
      };

      // Group active diagnostics by file path
      const diagsByFile = new Map<string, typeof comparison.activeDiagnostics>();
      for (const d of comparison.activeDiagnostics) {
        const existing = diagsByFile.get(d.filePath) || [];
        existing.push(d);
        diagsByFile.set(d.filePath, existing);
      }

      for (const file of changedFiles) {
        file.diagnostics = diagsByFile.get(file.path) || [];
      }
    } catch {
      // Continue gracefully
    }
  }

  // 9. Risk findings evaluation
  const allRisks = evaluateRiskFindings(changedFiles);

  // 10. Discover project checks
  let availableChecks: import('../models/scanResult').ProjectCheck[] = [];
  try {
    availableChecks = await discoverProjectChecks(workspaceRoot);
  } catch {
    // Continue gracefully
  }

  const protectedCount = changedFiles.filter((f) => f.kind === 'protected').length;
  const totalCount = changedFiles.length;
  const reviewedCount = changedFiles.filter((f) => f.isReviewed).length;

  let summaryMessage = `Discovered ${totalCount} changed file(s); ${protectedCount} protected match(es).`;
  if (totalCount === 0) {
    summaryMessage = 'No Git changes found in this workspace.';
  } else if (!isConfigured) {
    summaryMessage = `Discovered ${totalCount} changed file(s). (No protection rules configured)`;
  } else if (protectedCount === 0) {
    summaryMessage = `Discovered ${totalCount} changed file(s); no files matched protected paths.`;
  }

  return {
    workspaceRoot,
    scannedAt,
    status: 'success',
    changedFiles,
    protectedCount,
    totalCount,
    message: summaryMessage,
    isConfigured,
    allRisks,
    diagnosticsSummary,
    availableChecks,
    reviewedCount,
  };
}
