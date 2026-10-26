import * as vscode from 'vscode';
import { DiagnosticBaselineStatus, FileDiagnostic } from '../models/scanResult';

/**
 * In-memory storage for diagnostics baselines keyed by workspace folder.
 */
class DiagnosticsBaselineStore {
  private baselines = new Map<string, FileDiagnostic[]>();

  public setBaseline(workspaceRoot: string, diagnostics: FileDiagnostic[]): void {
    this.baselines.set(workspaceRoot, diagnostics);
  }

  public getBaseline(workspaceRoot: string): FileDiagnostic[] | undefined {
    return this.baselines.get(workspaceRoot);
  }

  public clear(workspaceRoot?: string): void {
    if (workspaceRoot) {
      this.baselines.delete(workspaceRoot);
    } else {
      this.baselines.clear();
    }
  }

  public hasBaseline(workspaceRoot: string): boolean {
    return this.baselines.has(workspaceRoot);
  }
}

export const baselineStore = new DiagnosticsBaselineStore();

/**
 * Creates a normalized signature key for a diagnostic to detect duplicates across runs.
 */
export function createDiagnosticKey(diag: {
  filePath: string;
  message: string;
  startLine: number;
  code?: string | number;
}): string {
  const normPath = diag.filePath.replace(/\\/g, '/');
  return `${normPath}:${diag.startLine}:${diag.code || ''}:${diag.message.trim()}`;
}

/**
 * Converts VS Code DiagnosticSeverity to our typed severity string.
 */
export function convertSeverity(
  sev: vscode.DiagnosticSeverity
): 'error' | 'warning' | 'info' | 'hint' {
  switch (sev) {
    case vscode.DiagnosticSeverity.Error:
      return 'error';
    case vscode.DiagnosticSeverity.Warning:
      return 'warning';
    case vscode.DiagnosticSeverity.Information:
      return 'info';
    case vscode.DiagnosticSeverity.Hint:
      return 'hint';
    default:
      return 'warning';
  }
}

/**
 * Retrieves all active diagnostics for files in the workspace.
 *
 * @param workspaceRoot - Absolute path to workspace root.
 */
export function collectWorkspaceDiagnostics(workspaceRoot: string): FileDiagnostic[] {
  const result: FileDiagnostic[] = [];
  const normRoot = workspaceRoot.replace(/\\/g, '/');

  try {
    const allEntries = vscode.languages.getDiagnostics();
    for (const [uri, diags] of allEntries) {
      if (uri.scheme !== 'file') {
        continue;
      }

      const fsPath = uri.fsPath.replace(/\\/g, '/');
      if (!fsPath.startsWith(normRoot)) {
        continue;
      }

      let relativePath = fsPath.slice(normRoot.length);
      if (relativePath.startsWith('/')) {
        relativePath = relativePath.slice(1);
      }

      for (const d of diags) {
        result.push({
          filePath: relativePath,
          message: d.message,
          severity: convertSeverity(d.severity),
          startLine: d.range.start.line + 1,
          startCharacter: d.range.start.character,
          endLine: d.range.end.line + 1,
          endCharacter: d.range.end.character,
          source: d.source,
          code: typeof d.code === 'object' ? d.code.value : d.code,
          baselineStatus: 'pre_existing',
        });
      }
    }
  } catch {
    // If running in environment without language diagnostics
  }

  return result;
}

/**
 * Compares current diagnostics against stored baseline and classifies each as:
 * - 'new': newly introduced since baseline
 * - 'pre_existing': already present in baseline
 * - 'resolved': present in baseline but no longer reported
 */
export function compareWithBaseline(
  workspaceRoot: string,
  currentDiagnostics: FileDiagnostic[]
): {
  activeDiagnostics: FileDiagnostic[];
  resolvedDiagnostics: FileDiagnostic[];
  newErrorsCount: number;
  newWarningsCount: number;
  preExistingErrorsCount: number;
  resolvedCount: number;
  hasBaseline: boolean;
} {
  const baseline = baselineStore.getBaseline(workspaceRoot);
  const hasBaseline = baseline !== undefined;

  if (!hasBaseline) {
    // No baseline has been recorded yet: all diagnostics are treated as pre-existing/current
    const active = currentDiagnostics.map((d) => ({
      ...d,
      baselineStatus: 'pre_existing' as DiagnosticBaselineStatus,
    }));

    const preExistingErrors = active.filter((d) => d.severity === 'error').length;

    return {
      activeDiagnostics: active,
      resolvedDiagnostics: [],
      newErrorsCount: 0,
      newWarningsCount: 0,
      preExistingErrorsCount: preExistingErrors,
      resolvedCount: 0,
      hasBaseline: false,
    };
  }

  const baselineKeys = new Set(baseline.map(createDiagnosticKey));
  const currentKeys = new Set(currentDiagnostics.map(createDiagnosticKey));

  let newErrorsCount = 0;
  let newWarningsCount = 0;
  let preExistingErrorsCount = 0;

  const activeDiagnostics: FileDiagnostic[] = currentDiagnostics.map((diag) => {
    const key = createDiagnosticKey(diag);
    if (!baselineKeys.has(key)) {
      if (diag.severity === 'error') {
        newErrorsCount++;
      } else {
        newWarningsCount++;
      }
      return { ...diag, baselineStatus: 'new' as DiagnosticBaselineStatus };
    } else {
      if (diag.severity === 'error') {
        preExistingErrorsCount++;
      }
      return { ...diag, baselineStatus: 'pre_existing' as DiagnosticBaselineStatus };
    }
  });

  const resolvedDiagnostics: FileDiagnostic[] = baseline
    .filter((diag) => !currentKeys.has(createDiagnosticKey(diag)))
    .map((diag) => ({
      ...diag,
      baselineStatus: 'resolved' as DiagnosticBaselineStatus,
    }));

  return {
    activeDiagnostics,
    resolvedDiagnostics,
    newErrorsCount,
    newWarningsCount,
    preExistingErrorsCount,
    resolvedCount: resolvedDiagnostics.length,
    hasBaseline: true,
  };
}

/**
 * Records the current diagnostics as the baseline for this workspace.
 */
export function recordCurrentBaseline(workspaceRoot: string): {
  count: number;
  errors: number;
  warnings: number;
} {
  const current = collectWorkspaceDiagnostics(workspaceRoot);
  baselineStore.setBaseline(workspaceRoot, current);

  const errors = current.filter((d) => d.severity === 'error').length;
  const warnings = current.filter((d) => d.severity === 'warning').length;

  return { count: current.length, errors, warnings };
}
