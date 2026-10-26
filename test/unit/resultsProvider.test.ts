import { describe, it, expect } from 'vitest';
import {
  buildResultsTree,
  formatScanTime,
  formatGitBadge,
} from '../../src/views/resultsProvider';
import { ScanResult, ChangedFile } from '../../src/models/scanResult';

describe('Results Tree Builder (buildResultsTree)', () => {
  it('displays initial action item when no scan has been run yet', () => {
    const items = buildResultsTree(undefined);
    expect(items).toHaveLength(1);
    expect(items[0].type).toBe('action_item');
    expect(items[0].label).toBe('No scan performed yet');
    expect(items[0].commandId).toBe('z-code-guard.scanWorkspace');
    expect(items[0].iconName).toBe('search');
  });

  it('displays actionable error state when configuration is missing', () => {
    const errorResult: ScanResult = {
      workspaceRoot: '/test/workspace',
      scannedAt: '2026-10-26T12:00:00.000Z',
      status: 'error',
      errorCode: 'CONFIG_MISSING',
      message: "Configuration file '.z-code-guard.json' was not found.",
      changedFiles: [],
      protectedCount: 0,
      totalCount: 0,
    };

    const items = buildResultsTree(errorResult);
    expect(items).toHaveLength(2);

    expect(items[0].type).toBe('error_state');
    expect(items[0].label).toBe('Configuration Missing');
    expect(items[0].iconName).toBe('warning');

    expect(items[1].type).toBe('action_item');
    expect(items[1].label).toBe('Create starter .z-code-guard.json');
    expect(items[1].commandId).toBe('z-code-guard.openConfiguration');
  });

  it('displays actionable error state when configuration is invalid', () => {
    const errorResult: ScanResult = {
      workspaceRoot: '/test/workspace',
      scannedAt: '2026-10-26T12:00:00.000Z',
      status: 'error',
      errorCode: 'CONFIG_INVALID',
      message: 'Invalid JSON syntax',
      changedFiles: [],
      protectedCount: 0,
      totalCount: 0,
    };

    const items = buildResultsTree(errorResult);
    expect(items).toHaveLength(2);
    expect(items[0].label).toBe('Configuration Invalid');
    expect(items[1].label).toBe('Open configuration to fix errors');
    expect(items[1].commandId).toBe('z-code-guard.openConfiguration');
  });

  it('displays informative error when workspace is not a Git repository', () => {
    const errorResult: ScanResult = {
      workspaceRoot: '/test/workspace',
      scannedAt: '2026-10-26T12:00:00.000Z',
      status: 'error',
      errorCode: 'NOT_A_GIT_REPO',
      message: 'Not a Git repository',
      changedFiles: [],
      protectedCount: 0,
      totalCount: 0,
    };

    const items = buildResultsTree(errorResult);
    expect(items).toHaveLength(1);
    expect(items[0].label).toBe('Not a Git Repository');
    expect(items[0].iconName).toBe('info');
  });

  it('displays clean working tree state when totalCount is 0', () => {
    const cleanResult: ScanResult = {
      workspaceRoot: '/test/workspace',
      scannedAt: '2026-10-26T12:00:00.000Z',
      status: 'success',
      changedFiles: [],
      protectedCount: 0,
      totalCount: 0,
    };

    const items = buildResultsTree(cleanResult);
    expect(items).toHaveLength(2);

    // Summary item
    expect(items[0].type).toBe('summary');
    expect(items[0].description).toBe('0 changed, 0 protected');

    // Clean state item
    expect(items[1].type).toBe('empty_state');
    expect(items[1].label).toBe('No Git changes found in this workspace.');
    expect(items[1].iconName).toBe('check');
  });

  it('displays PROTECTED CHANGES and OTHER CHANGES sections with correct files and commands', () => {
    const protectedFile: ChangedFile = {
      path: 'src/auth/session.ts',
      kind: 'protected',
      matchedPatterns: ['src/auth/**'],
      isStaged: true,
      isUnstaged: false,
      isUntracked: false,
      isDeleted: false,
      isRenamed: false,
    };

    const otherFile: ChangedFile = {
      path: 'src/pages/Home.tsx',
      kind: 'other',
      matchedPatterns: [],
      isStaged: false,
      isUnstaged: true,
      isUntracked: false,
      isDeleted: false,
      isRenamed: false,
    };

    const scanResult: ScanResult = {
      workspaceRoot: '/test/workspace',
      scannedAt: '2026-10-26T12:00:00.000Z',
      status: 'success',
      changedFiles: [protectedFile, otherFile],
      protectedCount: 1,
      totalCount: 2,
    };

    const items = buildResultsTree(scanResult, '/test/workspace');
    expect(items).toHaveLength(3);

    // 1. Summary
    expect(items[0].type).toBe('summary');
    expect(items[0].description).toBe('2 changed, 1 protected');

    // 2. Protected Section
    const protectedSection = items[1];
    expect(protectedSection.type).toBe('section_protected');
    expect(protectedSection.label).toBe('PROTECTED CHANGES');
    expect(protectedSection.description).toBe('1');
    expect(protectedSection.collapsible).toBe(true);
    expect(protectedSection.children).toHaveLength(1);

    const protectedItem = protectedSection.children![0];
    expect(protectedItem.type).toBe('file_protected');
    expect(protectedItem.label).toBe('src/auth/session.ts');
    expect(protectedItem.description).toContain('[staged]');
    expect(protectedItem.description).toContain('(src/auth/**)');
    expect(protectedItem.commandId).toBe('z-code-guard.openFile');
    expect(protectedItem.commandArgs).toEqual(['/test/workspace', 'src/auth/session.ts']);

    // 3. Other Section
    const otherSection = items[2];
    expect(otherSection.type).toBe('section_other');
    expect(otherSection.label).toBe('OTHER CHANGES');
    expect(otherSection.description).toBe('1');
    expect(otherSection.children).toHaveLength(1);

    const otherItem = otherSection.children![0];
    expect(otherItem.type).toBe('file_other');
    expect(otherItem.label).toBe('src/pages/Home.tsx');
    expect(otherItem.description).toBe('[unstaged]');
    expect(otherItem.commandId).toBe('z-code-guard.openFile');
  });

  it('handles deleted files by routing to showDeletedNotice command instead of openFile', () => {
    const deletedFile: ChangedFile = {
      path: 'src/auth/oldKey.ts',
      kind: 'protected',
      matchedPatterns: ['src/auth/**'],
      isStaged: false,
      isUnstaged: false,
      isUntracked: false,
      isDeleted: true,
      isRenamed: false,
    };

    const scanResult: ScanResult = {
      workspaceRoot: '/test/workspace',
      scannedAt: '2026-10-26T12:00:00.000Z',
      status: 'success',
      changedFiles: [deletedFile],
      protectedCount: 1,
      totalCount: 1,
    };

    const items = buildResultsTree(scanResult);
    const protectedSection = items[1];
    const fileItem = protectedSection.children![0];

    expect(fileItem.isDeleted).toBe(true);
    expect(fileItem.iconName).toBe('trash');
    expect(fileItem.commandId).toBe('z-code-guard.showDeletedNotice');
    expect(fileItem.commandArgs).toEqual(['src/auth/oldKey.ts']);
  });
});

describe('Formatting Helpers (formatScanTime & formatGitBadge)', () => {
  it('formats scan timestamp into time string', () => {
    const formatted = formatScanTime('2026-10-26T12:30:45.000Z');
    expect(formatted).toBeDefined();
    expect(typeof formatted).toBe('string');
  });

  it('returns raw string if timestamp is invalid', () => {
    expect(formatScanTime('invalid-time')).toBe('invalid-time');
  });

  it('formats Git status badges accurately', () => {
    const base: ChangedFile = {
      path: 'file.ts',
      kind: 'other',
      matchedPatterns: [],
      isStaged: false,
      isUnstaged: false,
      isUntracked: false,
      isDeleted: false,
      isRenamed: false,
    };

    expect(formatGitBadge({ ...base, isRenamed: true })).toBe('renamed');
    expect(formatGitBadge({ ...base, isDeleted: true })).toBe('deleted');
    expect(formatGitBadge({ ...base, isUntracked: true })).toBe('untracked');
    expect(formatGitBadge({ ...base, isStaged: true, isUnstaged: true })).toBe('staged + unstaged');
    expect(formatGitBadge({ ...base, isStaged: true })).toBe('staged');
    expect(formatGitBadge({ ...base, isUnstaged: true })).toBe('unstaged');
    expect(formatGitBadge(base)).toBe('modified');
  });
});
