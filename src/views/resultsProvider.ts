import * as vscode from 'vscode';
import { ChangedFile, ScanResult } from '../models/scanResult';

/**
 * Types of nodes that can appear in the Z-Code-Guard Results Tree View.
 */
export type ResultNodeType =
  | 'summary'
  | 'section_protected'
  | 'section_other'
  | 'section_risks'
  | 'section_diagnostics'
  | 'section_impact'
  | 'section_checks'
  | 'section_review'
  | 'file_protected'
  | 'file_other'
  | 'symbol_item'
  | 'diagnostic_item'
  | 'risk_item'
  | 'impact_item'
  | 'check_item'
  | 'empty_state'
  | 'error_state'
  | 'action_item';

/**
 * Pure data model representing a node in the tree hierarchy.
 * Separating this from VS Code UI components allows thorough unit testing.
 */
export interface ResultTreeItem {
  id: string;
  type: ResultNodeType;
  label: string;
  description?: string;
  tooltip?: string;
  collapsible: boolean;
  defaultExpanded?: boolean;
  iconName?: string;
  iconColorTheme?: string;
  filePath?: string;
  workspaceRoot?: string;
  isDeleted?: boolean;
  children?: ResultTreeItem[];
  commandId?: string;
  commandArgs?: unknown[];
}

/**
 * Formats an ISO 8601 timestamp string into a concise, readable local time (e.g. "1:45 PM").
 */
export function formatScanTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) {
      return isoString;
    }
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return isoString;
  }
}

/**
 * Formats concise Git status badges for file tree labels.
 */
export function formatGitBadge(file: ChangedFile): string {
  if (file.isRenamed) {
    return 'renamed';
  }
  if (file.isDeleted) {
    return 'deleted';
  }
  if (file.isUntracked) {
    return 'untracked';
  }
  if (file.isStaged && file.isUnstaged) {
    return 'staged + unstaged';
  }
  if (file.isStaged) {
    return 'staged';
  }
  if (file.isUnstaged) {
    return 'unstaged';
  }
  return 'modified';
}

/**
 * Creates child inspector items for an individual changed file.
 */
function buildFileDetailChildren(
  file: ChangedFile,
  workspaceRoot: string
): ResultTreeItem[] {
  const children: ResultTreeItem[] = [];

  // 1. View Diff action item
  if (!file.isDeleted) {
    const statText =
      file.additions !== undefined && file.deletions !== undefined
        ? `(+${file.additions} -${file.deletions} lines)`
        : '';
    children.push({
      id: `diff_${file.path}`,
      type: 'action_item',
      label: 'View Diff',
      description: statText,
      tooltip: 'Click to open side-by-side diff in editor',
      collapsible: false,
      iconName: 'diff',
      commandId: 'z-code-guard.viewDiff',
      commandArgs: [workspaceRoot, file],
    });
  }

  // 2. Changed Symbols (Functions, Classes, Methods)
  if (file.symbols && file.symbols.length > 0) {
    const symbolChildren: ResultTreeItem[] = file.symbols.map((sym, idx) => ({
      id: `sym_${file.path}_${idx}`,
      type: 'symbol_item',
      label: `${sym.name}`,
      description: `L${sym.startLine} [${sym.kind}${sym.isExported ? ', exported' : ''}]`,
      tooltip: `${sym.detail || sym.name}\nLine range: ${sym.startLine}-${sym.endLine}`,
      collapsible: false,
      iconName:
        sym.kind === 'function' || sym.kind === 'component'
          ? 'symbol-method'
          : sym.kind === 'class'
          ? 'symbol-class'
          : sym.kind === 'interface'
          ? 'symbol-interface'
          : 'symbol-variable',
      commandId: 'z-code-guard.openAtLine',
      commandArgs: [workspaceRoot, file.path, sym.startLine],
    }));

    children.push({
      id: `symbols_${file.path}`,
      type: 'symbol_item',
      label: 'Changed Code Symbols',
      description: `${file.symbols.length}`,
      tooltip: `${file.symbols.length} code symbol(s) overlap with modified lines`,
      collapsible: true,
      defaultExpanded: true,
      iconName: 'symbol-misc',
      children: symbolChildren,
    });
  }

  // 3. Diagnostics / Compiler Errors on this file
  if (file.diagnostics && file.diagnostics.length > 0) {
    const diagChildren: ResultTreeItem[] = file.diagnostics.map((d, idx) => ({
      id: `diag_${file.path}_${idx}`,
      type: 'diagnostic_item',
      label: d.message,
      description: `L${d.startLine} [${d.baselineStatus === 'new' ? 'NEW' : 'existing'}]`,
      tooltip: `${d.message} (Line ${d.startLine}:${d.startCharacter})\nStatus: ${d.baselineStatus}`,
      collapsible: false,
      iconName: d.severity === 'error' ? 'error' : 'warning',
      iconColorTheme: d.severity === 'error' ? 'errorForeground' : 'editorWarning.foreground',
      commandId: 'z-code-guard.openAtLine',
      commandArgs: [workspaceRoot, file.path, d.startLine],
    }));

    children.push({
      id: `diags_${file.path}`,
      type: 'diagnostic_item',
      label: 'Active Diagnostics',
      description: `${file.diagnostics.length}`,
      tooltip: `${file.diagnostics.length} diagnostic(s) reported on this file`,
      collapsible: true,
      defaultExpanded: true,
      iconName: 'issues',
      children: diagChildren,
    });
  }

  // 4. Potential Impact References
  if (file.impactReferences && file.impactReferences.length > 0) {
    const impactChildren: ResultTreeItem[] = file.impactReferences.map((ref, idx) => ({
      id: `impact_${file.path}_${idx}`,
      type: 'impact_item',
      label: ref.referencingFile,
      description: `[${ref.referenceType === 'test_file' ? 'test' : ref.isVerified ? 'verified' : 'heuristic'}]`,
      tooltip: `Evidence: ${ref.evidence}\nReferenced symbol: ${ref.targetSymbol}`,
      collapsible: false,
      iconName: ref.referenceType === 'test_file' ? 'beaker' : 'references',
      commandId: 'z-code-guard.openFile',
      commandArgs: [workspaceRoot, ref.referencingFile],
    }));

    children.push({
      id: `impact_sec_${file.path}`,
      type: 'impact_item',
      label: 'Potentially Affected References',
      description: `${file.impactReferences.length}`,
      tooltip: `${file.impactReferences.length} file(s) reference this module or its exported symbols`,
      collapsible: true,
      defaultExpanded: false,
      iconName: 'references',
      children: impactChildren,
    });
  }

  return children;
}

/**
 * Builds the complete hierarchy of ResultTreeItems based on the latest scan result.
 *
 * @param scanResult - Latest ScanResult from scanService, or undefined if no scan has run yet.
 * @param workspaceRoot - Workspace folder path for file opening actions.
 */
export function buildResultsTree(
  scanResult?: ScanResult,
  workspaceRoot?: string
): ResultTreeItem[] {
  // State 1: No scan has been run yet
  if (!scanResult) {
    return [
      {
        id: 'initial_state',
        type: 'action_item',
        label: 'No scan performed yet',
        description: 'Click to scan workspace',
        tooltip: 'Run Z-Code-Guard to detect changes against your protected paths',
        collapsible: false,
        iconName: 'search',
        commandId: 'z-code-guard.scanWorkspace',
      },
    ];
  }

  // State 2: Scan produced an error
  if (scanResult.status === 'error') {
    const errorItems: ResultTreeItem[] = [];

    let title = 'Scan Error';
    let iconName = 'error';

    if (scanResult.errorCode === 'CONFIG_MISSING') {
      title = 'Configuration Missing';
      iconName = 'warning';
    } else if (scanResult.errorCode === 'CONFIG_INVALID') {
      title = 'Configuration Invalid';
      iconName = 'error';
    } else if (scanResult.errorCode === 'NOT_A_GIT_REPO') {
      title = 'Not a Git Repository';
      iconName = 'info';
    } else if (scanResult.errorCode === 'GIT_NOT_INSTALLED') {
      title = 'Git Not Available';
      iconName = 'error';
    }

    errorItems.push({
      id: 'error_header',
      type: 'error_state',
      label: title,
      description: scanResult.message,
      tooltip: scanResult.message,
      collapsible: false,
      iconName,
      iconColorTheme: 'errorForeground',
    });

    // Provide actionable next steps for fixable errors
    if (scanResult.errorCode === 'CONFIG_MISSING') {
      errorItems.push({
        id: 'action_create_config',
        type: 'action_item',
        label: 'Create starter .z-code-guard.json',
        tooltip: 'Click to create a starter configuration file in your workspace',
        collapsible: false,
        iconName: 'add',
        commandId: 'z-code-guard.openConfiguration',
      });
    } else if (scanResult.errorCode === 'CONFIG_INVALID') {
      errorItems.push({
        id: 'action_edit_config',
        type: 'action_item',
        label: 'Open configuration to fix errors',
        tooltip: 'Click to open .z-code-guard.json in the editor',
        collapsible: false,
        iconName: 'edit',
        commandId: 'z-code-guard.openConfiguration',
      });
    }

    return errorItems;
  }

  // State 3: Successful Scan
  const items: ResultTreeItem[] = [];
  const root = workspaceRoot || scanResult.workspaceRoot;

  // 1. Summary Header
  const timeFormatted = formatScanTime(scanResult.scannedAt);
  items.push({
    id: 'summary_header',
    type: 'summary',
    label: `Last scan: ${timeFormatted}`,
    description: `${scanResult.totalCount} changed, ${scanResult.protectedCount} protected`,
    tooltip: `Scanned at ${scanResult.scannedAt} in ${scanResult.workspaceRoot}`,
    collapsible: false,
    iconName: scanResult.protectedCount > 0 ? 'shield' : 'check',
    iconColorTheme: scanResult.protectedCount > 0 ? 'charts.red' : undefined,
  });

  // 2. Working Tree Clean
  if (scanResult.totalCount === 0) {
    items.push({
      id: 'clean_state',
      type: 'empty_state',
      label: 'No Git changes found in this workspace.',
      description: 'Working tree clean',
      tooltip: 'No staged, unstaged, or untracked changes were detected.',
      collapsible: false,
      iconName: 'check',
    });
    return items;
  }

  // 3. PROTECTED CHANGES Section
  const protectedFiles = scanResult.changedFiles.filter((f) => f.kind === 'protected');
  const protectedChildren: ResultTreeItem[] = [];

  if (protectedFiles.length === 0) {
    protectedChildren.push({
      id: 'empty_protected',
      type: 'empty_state',
      label: 'No changed files matched your protected paths.',
      collapsible: false,
      iconName: 'check',
    });
  } else {
    for (const file of protectedFiles) {
      const badge = formatGitBadge(file);
      const ruleText = file.matchedPatterns.length > 0 ? `(${file.matchedPatterns.join(', ')})` : '';
      const statText =
        file.additions !== undefined && (file.additions > 0 || (file.deletions || 0) > 0)
          ? ` (+${file.additions} -${file.deletions || 0})`
          : '';
      const desc = `[${badge}]${statText} ${ruleText}`.trim();

      const tooltipLines = [
        `Path: ${file.path}`,
        file.oldPath ? `Renamed from: ${file.oldPath}` : '',
        `Status: ${badge}`,
        `Matched Rules: ${file.matchedPatterns.join(', ')}`,
        file.isReviewed ? 'Status: Marked as Reviewed' : '',
        file.isDeleted ? 'File is deleted' : 'Click to open file in editor',
      ].filter(Boolean);

      const fileDetails = buildFileDetailChildren(file, root);
      const hasChildren = fileDetails.length > 0;

      protectedChildren.push({
        id: `protected_${file.path}`,
        type: 'file_protected',
        label: file.isReviewed ? `✓ ${file.path}` : file.path,
        description: desc,
        tooltip: tooltipLines.join('\n'),
        collapsible: hasChildren,
        defaultExpanded: false,
        iconName: file.isDeleted
          ? 'trash'
          : file.isUntracked
          ? 'diff-added'
          : 'diff-modified',
        iconColorTheme: 'charts.red',
        filePath: file.path,
        workspaceRoot: root,
        isDeleted: file.isDeleted,
        commandId: file.isDeleted ? 'z-code-guard.showDeletedNotice' : 'z-code-guard.openFile',
        commandArgs: file.isDeleted ? [file.path] : [root, file.path],
        children: hasChildren ? fileDetails : undefined,
      });
    }
  }

  items.push({
    id: 'section_protected',
    type: 'section_protected',
    label: 'PROTECTED CHANGES',
    description: `${protectedFiles.length}`,
    tooltip: `${protectedFiles.length} file(s) matched your configured protection rules`,
    collapsible: true,
    defaultExpanded: true,
    iconName: 'shield',
    iconColorTheme: protectedFiles.length > 0 ? 'charts.red' : undefined,
    children: protectedChildren,
  });

  // 4. OTHER CHANGES Section
  const otherFiles = scanResult.changedFiles.filter((f) => f.kind === 'other');
  const otherChildren: ResultTreeItem[] = [];

  if (otherFiles.length === 0) {
    otherChildren.push({
      id: 'empty_other',
      type: 'empty_state',
      label: 'No other changes.',
      collapsible: false,
      iconName: 'check',
    });
  } else {
    for (const file of otherFiles) {
      const badge = formatGitBadge(file);
      const statText =
        file.additions !== undefined && (file.additions > 0 || (file.deletions || 0) > 0)
          ? ` (+${file.additions} -${file.deletions || 0})`
          : '';
      const desc = statText ? `[${badge}]${statText}` : `[${badge}]`;

      const tooltipLines = [
        `Path: ${file.path}`,
        file.oldPath ? `Renamed from: ${file.oldPath}` : '',
        `Status: ${badge}`,
        file.isReviewed ? 'Status: Marked as Reviewed' : '',
        file.isDeleted ? 'File is deleted' : 'Click to open file in editor',
      ].filter(Boolean);

      const fileDetails = buildFileDetailChildren(file, root);
      const hasChildren = fileDetails.length > 0;

      otherChildren.push({
        id: `other_${file.path}`,
        type: 'file_other',
        label: file.isReviewed ? `✓ ${file.path}` : file.path,
        description: desc,
        tooltip: tooltipLines.join('\n'),
        collapsible: hasChildren,
        defaultExpanded: false,
        iconName: file.isDeleted
          ? 'trash'
          : file.isUntracked
          ? 'diff-added'
          : 'diff-modified',
        filePath: file.path,
        workspaceRoot: root,
        isDeleted: file.isDeleted,
        commandId: file.isDeleted ? 'z-code-guard.showDeletedNotice' : 'z-code-guard.openFile',
        commandArgs: file.isDeleted ? [file.path] : [root, file.path],
        children: hasChildren ? fileDetails : undefined,
      });
    }
  }

  items.push({
    id: 'section_other',
    type: 'section_other',
    label: 'OTHER CHANGES',
    description: `${otherFiles.length}`,
    tooltip: `${otherFiles.length} file(s) changed outside protected boundaries`,
    collapsible: true,
    defaultExpanded: protectedFiles.length === 0,
    iconName: 'files',
    children: otherChildren,
  });

  // 5. RISK FINDINGS Section (included when risk findings exist)
  if (scanResult.allRisks && scanResult.allRisks.length > 0) {
    const riskChildren: ResultTreeItem[] = scanResult.allRisks.map((risk) => ({
      id: `risk_${risk.id}`,
      type: 'risk_item',
      label: risk.title,
      description: `${risk.filePath}${risk.lineRange ? `:${risk.lineRange.start}` : ''} [${risk.severity.toUpperCase()}]`,
      tooltip: `${risk.message}\nEvidence: ${risk.evidence}\nVerification: ${risk.suggestedVerification}`,
      collapsible: false,
      iconName:
        risk.severity === 'high'
          ? 'alert'
          : risk.severity === 'medium'
          ? 'warning'
          : 'info',
      iconColorTheme:
        risk.severity === 'high'
          ? 'errorForeground'
          : risk.severity === 'medium'
          ? 'editorWarning.foreground'
          : undefined,
      commandId: risk.lineRange ? 'z-code-guard.openAtLine' : 'z-code-guard.openFile',
      commandArgs: risk.lineRange
        ? [root, risk.filePath, risk.lineRange.start]
        : [root, risk.filePath],
    }));

    items.push({
      id: 'section_risks',
      type: 'section_risks',
      label: 'RISK FINDINGS',
      description: `${scanResult.allRisks.length}`,
      tooltip: `${scanResult.allRisks.length} evidence-based risk finding(s)`,
      collapsible: true,
      defaultExpanded: true,
      iconName: 'shield',
      iconColorTheme: 'charts.red',
      children: riskChildren,
    });
  }

  // 6. VALIDATION CHECKS Section (included when discovered checks exist)
  if (scanResult.availableChecks && scanResult.availableChecks.length > 0) {
    const checkChildren: ResultTreeItem[] = scanResult.availableChecks.map((check) => ({
      id: `check_${check.id}`,
      type: 'check_item',
      label: check.name,
      description: check.command,
      tooltip: `Click to execute '${check.command}' with confirmation`,
      collapsible: false,
      iconName: check.type === 'test' ? 'beaker' : check.type === 'lint' ? 'symbol-ruler' : 'tools',
      commandId: 'z-code-guard.runCheck',
      commandArgs: [check, root],
    }));

    items.push({
      id: 'section_checks',
      type: 'section_checks',
      label: 'VALIDATION CHECKS',
      description: `${scanResult.availableChecks.length} available`,
      tooltip: 'Discovered project validation checks (requires explicit click to run)',
      collapsible: true,
      defaultExpanded: false,
      iconName: 'checklist',
      children: checkChildren,
    });
  }

  return items;
}

/**
 * VS Code TreeDataProvider implementation for the Z-Code-Guard Results View.
 */
export class ResultsProvider implements vscode.TreeDataProvider<ResultTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<ResultTreeItem | undefined | null | void> =
    new vscode.EventEmitter<ResultTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<ResultTreeItem | undefined | null | void> =
    this._onDidChangeTreeData.event;

  private currentResult?: ScanResult;
  private currentWorkspaceRoot?: string;

  /**
   * Updates the provider with a new scan result and refreshes the tree view.
   *
   * @param result - New ScanResult
   * @param workspaceRoot - Optional workspace root path
   */
  public setScanResult(result: ScanResult, workspaceRoot?: string): void {
    this.currentResult = result;
    this.currentWorkspaceRoot = workspaceRoot || result.workspaceRoot;
    this._onDidChangeTreeData.fire();
  }

  /**
   * Resets the view to initial state.
   */
  public clear(): void {
    this.currentResult = undefined;
    this.currentWorkspaceRoot = undefined;
    this._onDidChangeTreeData.fire();
  }

  public getTreeItem(element: ResultTreeItem): vscode.TreeItem {
    const collapsibleState = element.collapsible
      ? element.defaultExpanded
        ? vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.Collapsed
      : vscode.TreeItemCollapsibleState.None;

    const treeItem = new vscode.TreeItem(element.label, collapsibleState);
    treeItem.id = element.id;
    treeItem.description = element.description;
    treeItem.tooltip = element.tooltip;
    treeItem.contextValue = element.type;

    if (element.iconName) {
      if (element.iconColorTheme) {
        treeItem.iconPath = new vscode.ThemeIcon(
          element.iconName,
          new vscode.ThemeColor(element.iconColorTheme)
        );
      } else {
        treeItem.iconPath = new vscode.ThemeIcon(element.iconName);
      }
    }

    if (element.commandId) {
      treeItem.command = {
        command: element.commandId,
        title: element.label,
        arguments: element.commandArgs,
      };
    }

    return treeItem;
  }

  public getChildren(element?: ResultTreeItem): Thenable<ResultTreeItem[]> {
    if (!element) {
      // Root level items
      return Promise.resolve(buildResultsTree(this.currentResult, this.currentWorkspaceRoot));
    }

    // Children of a collapsible section or file node
    return Promise.resolve(element.children || []);
  }
}
