import { GitFileDiff } from '../git/gitDiffScanner';

/**
 * Classification category for a changed file:
 * - 'protected': Matches one or more configured protected paths.
 * - 'other': Changed file that does not match any protected pattern.
 */
export type ChangeKind = 'protected' | 'other';

/**
 * Kind of code symbol identified in static analysis.
 */
export type SymbolKind =
  | 'function'
  | 'method'
  | 'class'
  | 'interface'
  | 'type'
  | 'export'
  | 'import'
  | 'variable'
  | 'component'
  | 'other';

/**
 * A code symbol located within a changed file.
 */
export interface ChangedSymbol {
  name: string;
  kind: SymbolKind;
  startLine: number;
  endLine: number;
  isExported: boolean;
  containerName?: string;
  detail?: string;
  signature?: string;
}

/**
 * Severity level for risk indicators.
 */
export type RiskSeverity = 'low' | 'medium' | 'high' | 'needs_review';

/**
 * Confidence level distinguishing confirmed facts from heuristics.
 */
export type FindingConfidence = 'confirmed' | 'heuristic' | 'unknown';

/**
 * An evidence-based risk or review finding.
 */
export interface RiskFinding {
  id: string;
  ruleId: string;
  severity: RiskSeverity;
  title: string;
  message: string;
  filePath: string;
  lineRange?: { start: number; end: number };
  evidence: string;
  suggestedVerification: string;
  confidence: FindingConfidence;
  category:
    | 'protected_boundary'
    | 'auth_or_security'
    | 'permission_access'
    | 'secrets_or_env'
    | 'breaking_api'
    | 'package_manifest'
    | 'new_error'
    | 'destructive_pattern';
}

/**
 * Diagnostic tracking status compared against baseline snapshot.
 */
export type DiagnosticBaselineStatus = 'new' | 'pre_existing' | 'resolved';

/**
 * Diagnostic item associated with a changed file.
 */
export interface FileDiagnostic {
  filePath: string;
  message: string;
  severity: 'error' | 'warning' | 'info' | 'hint';
  startLine: number;
  startCharacter: number;
  endLine: number;
  endCharacter: number;
  source?: string;
  code?: string | number;
  baselineStatus: DiagnosticBaselineStatus;
}

/**
 * Potential affected dependent file reference.
 */
export interface ImpactReference {
  referencingFile: string;
  referencingSymbol?: string;
  referenceType: 'verified_import' | 'verified_reference' | 'heuristic_text' | 'test_file';
  evidence: string;
  targetSymbol: string;
  isVerified: boolean;
}

/**
 * Detailed representation of a classified changed file in the workspace.
 */
export interface ChangedFile {
  /** Workspace-relative path to the file with normalized forward slashes ('/'). */
  path: string;

  /** For renamed or copied files, the original path before the change. */
  oldPath?: string;

  /** Classification category ('protected' | 'other'). */
  kind: ChangeKind;

  /** List of configured protected patterns that matched this file. Empty if kind is 'other'. */
  matchedPatterns: string[];

  /** True if changes are staged in the Git index. */
  isStaged: boolean;

  /** True if changes exist in the working tree (unstaged). */
  isUnstaged: boolean;

  /** True if the file is untracked by Git. */
  isUntracked: boolean;

  /** True if the file was deleted. */
  isDeleted: boolean;

  /** True if the file was renamed. */
  isRenamed: boolean;

  /** Lines added (from git diff numstat or file content). */
  additions?: number;

  /** Lines deleted (from git diff numstat). */
  deletions?: number;

  /** Detailed diff and hunk information. */
  diff?: GitFileDiff;

  /** Changed functions, methods, classes, and exported symbols. */
  symbols?: ChangedSymbol[];

  /** Evidence-based risk findings for this file. */
  risks?: RiskFinding[];

  /** Active compiler, linter, or language server diagnostics for this file. */
  diagnostics?: FileDiagnostic[];

  /** Potentially affected files/callers discovered through impact analysis. */
  impactReferences?: ImpactReference[];

  /** Has the developer marked this file as reviewed in the current session. */
  isReviewed?: boolean;
}

/**
 * Status indicator for the scan operation.
 */
export type ScanStatus = 'success' | 'partial' | 'error';

/**
 * Specific error codes for typed error handling.
 */
export type ScanErrorCode =
  | 'NO_WORKSPACE'
  | 'CONFIG_MISSING'
  | 'CONFIG_INVALID'
  | 'GIT_NOT_INSTALLED'
  | 'NOT_A_GIT_REPO'
  | 'GIT_COMMAND_FAILED';

/**
 * Discovered project validation check.
 */
export interface ProjectCheck {
  id: string;
  name: string;
  type: 'typecheck' | 'lint' | 'test' | 'build';
  command: string;
  isAvailable: boolean;
  status: 'idle' | 'running' | 'passed' | 'failed' | 'not_run';
  lastRunTime?: string;
  outputSnippet?: string;
}

/**
 * Complete typed report of a workspace scan.
 */
export interface ScanResult {
  /** Absolute path to the workspace root directory that was scanned. */
  workspaceRoot: string;

  /** ISO 8601 timestamp string when the scan was performed. */
  scannedAt: string;

  /** Scan outcome: 'success', 'partial', or 'error'. */
  status: ScanStatus;

  /** Array of changed files discovered and classified. */
  changedFiles: ChangedFile[];

  /** Number of files classified as 'protected'. */
  protectedCount: number;

  /** Total number of changed files (protected + other). */
  totalCount: number;

  /** Human-readable message explaining the scan outcome or error. */
  message?: string;

  /** Machine-readable error code if status is 'error'. */
  errorCode?: ScanErrorCode;

  /** True if `.z-code-guard.json` is present and configured in workspace. */
  isConfigured?: boolean;

  /** All risk findings across all changed files. */
  allRisks?: RiskFinding[];

  /** All diagnostics across changed files, separated into new and pre-existing. */
  diagnosticsSummary?: {
    newErrorsCount: number;
    newWarningsCount: number;
    preExistingErrorsCount: number;
    resolvedCount: number;
  };

  /** Available discovered project checks. */
  availableChecks?: ProjectCheck[];

  /** Count of reviewed files in current review session. */
  reviewedCount?: number;
}
