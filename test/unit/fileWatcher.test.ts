import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isRelevantFileUri,
  isConfigFileUri,
  setupWorkspaceWatcher,
} from '../../src/events/fileWatcher';
import { ResultsProvider } from '../../src/views/resultsProvider';
import {
  Uri,
  workspace,
  _testListeners,
  WorkspaceFolder,
} from '../mocks/vscode';

describe('File Watcher Relevance Filtering (isRelevantFileUri & isConfigFileUri)', () => {
  const mockFolder: WorkspaceFolder = {
    uri: Uri.file('/test/workspace'),
    name: 'workspace',
    index: 0,
  };

  beforeEach(() => {
    workspace.workspaceFolders = [mockFolder];
  });

  afterEach(() => {
    workspace.workspaceFolders = [];
  });

  it('rejects URIs with non-file schemes (e.g. git:, untitled:, output:)', () => {
    const gitUri = Uri.parse('git:/test/workspace/file.ts');
    expect(isRelevantFileUri(gitUri)).toBe(false);

    const untitledUri = Uri.parse('untitled:Untitled-1');
    expect(isRelevantFileUri(untitledUri)).toBe(false);
  });

  it('rejects internal Git files (e.g. .git/index, .git/COMMIT_EDITMSG)', () => {
    const gitIndexUri = Uri.file('/test/workspace/.git/index');
    expect(isRelevantFileUri(gitIndexUri)).toBe(false);

    const gitCommitMsgUri = Uri.file('/test/workspace/.git/COMMIT_EDITMSG');
    expect(isRelevantFileUri(gitCommitMsgUri)).toBe(false);
  });

  it('rejects common operating system artifacts (.DS_Store)', () => {
    const dsStoreUri = Uri.file('/test/workspace/.DS_Store');
    expect(isRelevantFileUri(dsStoreUri)).toBe(false);
  });

  it('rejects files located outside any active workspace folder', () => {
    const outsideUri = Uri.file('/other/directory/file.ts');
    expect(isRelevantFileUri(outsideUri)).toBe(false);
  });

  it('accepts regular workspace source files', () => {
    const srcUri = Uri.file('/test/workspace/src/auth/session.ts');
    expect(isRelevantFileUri(srcUri)).toBe(true);
  });

  it('accepts the .z-code-guard.json configuration file', () => {
    const configUri = Uri.file('/test/workspace/.z-code-guard.json');
    expect(isRelevantFileUri(configUri)).toBe(true);
    expect(isConfigFileUri(configUri)).toBe(true);
  });

  it('correctly identifies non-config files with isConfigFileUri', () => {
    const otherUri = Uri.file('/test/workspace/src/index.ts');
    expect(isConfigFileUri(otherUri)).toBe(false);
  });
});

describe('Workspace Watcher Coordinator (setupWorkspaceWatcher)', () => {
  let mockProvider: ResultsProvider;
  const mockFolder: WorkspaceFolder = {
    uri: Uri.file('/test/workspace'),
    name: 'workspace',
    index: 0,
  };

  beforeEach(() => {
    vi.useFakeTimers();
    _testListeners.reset();
    workspace.workspaceFolders = [mockFolder];
    mockProvider = new ResultsProvider();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    _testListeners.reset();
    workspace.workspaceFolders = [];
  });

  it('subscribes to save, create, delete, and rename events on setup', () => {
    const disposable = setupWorkspaceWatcher(mockProvider, { debounceDelayMs: 200 });

    expect(_testListeners.saveListeners.length).toBe(1);
    expect(_testListeners.createListeners.length).toBe(1);
    expect(_testListeners.deleteListeners.length).toBe(1);
    expect(_testListeners.renameListeners.length).toBe(1);

    disposable.dispose();

    // Verify cleanup
    expect(_testListeners.saveListeners.length).toBe(0);
    expect(_testListeners.createListeners.length).toBe(0);
    expect(_testListeners.deleteListeners.length).toBe(0);
    expect(_testListeners.renameListeners.length).toBe(0);
  });

  it('debounces rapid save events so only one refresh triggers after delay', async () => {
    const disposable = setupWorkspaceWatcher(mockProvider, { debounceDelayMs: 200 });
    const setScanResultSpy = vi.spyOn(mockProvider, 'setScanResult');

    // Simulate 3 rapid file saves within the 200ms window
    _testListeners.saveListeners[0]({ uri: Uri.file('/test/workspace/src/auth/1.ts') });
    _testListeners.saveListeners[0]({ uri: Uri.file('/test/workspace/src/auth/2.ts') });
    _testListeners.saveListeners[0]({ uri: Uri.file('/test/workspace/src/auth/3.ts') });

    // Advance 100ms (before deadline)
    vi.advanceTimersByTime(100);

    // Another save resets the timer
    _testListeners.saveListeners[0]({ uri: Uri.file('/test/workspace/src/auth/4.ts') });

    vi.advanceTimersByTime(150);
    // Still not fired because 200ms hasn't passed since 4th save

    // Advance past 200ms
    vi.advanceTimersByTime(60);

    // After debounce settles, only 1 scan should have been initiated
    disposable.dispose();
  });

  it('ignores non-relevant file events (e.g. .git/index saves)', () => {
    const disposable = setupWorkspaceWatcher(mockProvider, { debounceDelayMs: 200 });

    // Save internal Git file
    _testListeners.saveListeners[0]({ uri: Uri.file('/test/workspace/.git/index') });

    vi.advanceTimersByTime(300);
    // Provider should not be updated for .git internal saves
    disposable.dispose();
  });

  it('triggers refresh when .z-code-guard.json is saved', () => {
    const disposable = setupWorkspaceWatcher(mockProvider, { debounceDelayMs: 100 });

    _testListeners.saveListeners[0]({ uri: Uri.file('/test/workspace/.z-code-guard.json') });
    vi.advanceTimersByTime(150);

    disposable.dispose();
  });
});
