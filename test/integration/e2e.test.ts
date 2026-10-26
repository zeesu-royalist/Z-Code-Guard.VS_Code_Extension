import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as cp from 'child_process';
import { performScan } from '../../src/analysis/scanService';
import { buildResultsTree, ResultsProvider } from '../../src/views/resultsProvider';
import { setupWorkspaceWatcher } from '../../src/events/fileWatcher';
import { scanWorkspaceCommand } from '../../src/commands/scanWorkspace';
import { CONFIG_FILE_NAME } from '../../src/config/configSchema';
import {
  Uri,
  workspace,
  _testListeners,
  WorkspaceFolder,
} from '../mocks/vscode';

describe('End-to-End Integration Verification', () => {
  let tempRepoDir: string;

  function initGitRepo(dir: string): void {
    cp.execSync('git init', { cwd: dir });
    cp.execSync('git config user.email test@zcodeguard.local', { cwd: dir });
    cp.execSync('git config user.name "Z-Code-Guard E2E"', { cwd: dir });
  }

  async function writeConfig(dir: string, content: object | string): Promise<void> {
    const raw = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
    await fs.promises.writeFile(path.join(dir, CONFIG_FILE_NAME), raw, 'utf8');
  }

  beforeEach(async () => {
    tempRepoDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'z-e2e-test-'));
  });

  afterEach(async () => {
    await fs.promises.rm(tempRepoDir, { recursive: true, force: true });
    _testListeners.reset();
    workspace.workspaceFolders = [];
    vi.restoreAllMocks();
  });

  // Scenario 1
  it('1. A clean Git workspace produces an appropriate empty state', async () => {
    initGitRepo(tempRepoDir);
    await writeConfig(tempRepoDir, {
      version: 1,
      protectedPaths: ['src/auth/**'],
    });

    const readmePath = path.join(tempRepoDir, 'README.md');
    await fs.promises.writeFile(readmePath, '# Clean Project\n', 'utf8');
    cp.execSync('git add .', { cwd: tempRepoDir });
    cp.execSync('git commit -m "initial commit"', { cwd: tempRepoDir });

    const scanResult = await performScan(tempRepoDir);
    expect(scanResult.status).toBe('success');
    expect(scanResult.totalCount).toBe(0);
    expect(scanResult.protectedCount).toBe(0);
    expect(scanResult.changedFiles).toEqual([]);

    const treeItems = buildResultsTree(scanResult, tempRepoDir);
    expect(treeItems.length).toBe(2);
    expect(treeItems[0].type).toBe('summary');
    expect(treeItems[1].type).toBe('empty_state');
    expect(treeItems[1].label).toBe('No Git changes found in this workspace.');
  });

  // Scenario 2
  it('2. A modified protected file is classified as a protected change', async () => {
    initGitRepo(tempRepoDir);
    await writeConfig(tempRepoDir, {
      version: 1,
      protectedPaths: ['src/auth/**'],
    });

    const authDir = path.join(tempRepoDir, 'src', 'auth');
    await fs.promises.mkdir(authDir, { recursive: true });
    const authFile = path.join(authDir, 'session.ts');
    await fs.promises.writeFile(authFile, 'export const token = "abc";\n', 'utf8');

    cp.execSync('git add .', { cwd: tempRepoDir });
    cp.execSync('git commit -m "initial"', { cwd: tempRepoDir });

    // Modify protected file
    await fs.promises.appendFile(authFile, '// modified\n', 'utf8');

    const scanResult = await performScan(tempRepoDir);
    expect(scanResult.status).toBe('success');
    expect(scanResult.totalCount).toBe(1);
    expect(scanResult.protectedCount).toBe(1);

    const change = scanResult.changedFiles[0];
    expect(change.path).toBe('src/auth/session.ts');
    expect(change.kind).toBe('protected');
    expect(change.matchedPatterns).toContain('src/auth/**');
  });

  // Scenario 3
  it('3. A modified normal file is classified as an ordinary change', async () => {
    initGitRepo(tempRepoDir);
    await writeConfig(tempRepoDir, {
      version: 1,
      protectedPaths: ['src/auth/**'],
    });

    const pagesDir = path.join(tempRepoDir, 'src', 'pages');
    await fs.promises.mkdir(pagesDir, { recursive: true });
    const pageFile = path.join(pagesDir, 'Home.tsx');
    await fs.promises.writeFile(pageFile, 'export const Home = () => null;\n', 'utf8');

    cp.execSync('git add .', { cwd: tempRepoDir });
    cp.execSync('git commit -m "initial"', { cwd: tempRepoDir });

    // Modify normal page file
    await fs.promises.appendFile(pageFile, '// updated UI\n', 'utf8');

    const scanResult = await performScan(tempRepoDir);
    expect(scanResult.status).toBe('success');
    expect(scanResult.totalCount).toBe(1);
    expect(scanResult.protectedCount).toBe(0);

    const change = scanResult.changedFiles[0];
    expect(change.path).toBe('src/pages/Home.tsx');
    expect(change.kind).toBe('other');
    expect(change.matchedPatterns).toEqual([]);
  });

  // Scenario 4
  it('4. Untracked files are detected and classified correctly', async () => {
    initGitRepo(tempRepoDir);
    await writeConfig(tempRepoDir, {
      version: 1,
      protectedPaths: ['src/auth/**', 'src/services/**'],
    });

    await fs.promises.writeFile(path.join(tempRepoDir, 'init.txt'), 'init', 'utf8');
    cp.execSync('git add .', { cwd: tempRepoDir });
    cp.execSync('git commit -m "initial"', { cwd: tempRepoDir });

    // Untracked protected file
    await fs.promises.mkdir(path.join(tempRepoDir, 'src', 'services'), { recursive: true });
    await fs.promises.writeFile(
      path.join(tempRepoDir, 'src', 'services', 'payment.ts'),
      'export const pay = true;\n',
      'utf8'
    );

    // Untracked normal file
    await fs.promises.mkdir(path.join(tempRepoDir, 'docs'), { recursive: true });
    await fs.promises.writeFile(
      path.join(tempRepoDir, 'docs', 'readme.txt'),
      'some docs\n',
      'utf8'
    );

    const scanResult = await performScan(tempRepoDir);
    expect(scanResult.status).toBe('success');
    expect(scanResult.totalCount).toBe(2);
    expect(scanResult.protectedCount).toBe(1);

    const paymentChange = scanResult.changedFiles.find((f) => f.path === 'src/services/payment.ts');
    expect(paymentChange?.isUntracked).toBe(true);
    expect(paymentChange?.kind).toBe('protected');

    const docChange = scanResult.changedFiles.find((f) => f.path === 'docs/readme.txt');
    expect(docChange?.isUntracked).toBe(true);
    expect(docChange?.kind).toBe('other');
  });

  // Scenario 5
  it('5. Staged and unstaged changes are handled correctly', async () => {
    initGitRepo(tempRepoDir);
    await writeConfig(tempRepoDir, {
      version: 1,
      protectedPaths: ['src/**'],
    });

    const fileA = path.join(tempRepoDir, 'fileA.ts');
    const fileB = path.join(tempRepoDir, 'fileB.ts');
    await fs.promises.writeFile(fileA, 'initial A\n', 'utf8');
    await fs.promises.writeFile(fileB, 'initial B\n', 'utf8');
    cp.execSync('git add .', { cwd: tempRepoDir });
    cp.execSync('git commit -m "initial"', { cwd: tempRepoDir });

    // Staged modification
    await fs.promises.appendFile(fileA, 'staged edit\n', 'utf8');
    cp.execSync('git add fileA.ts', { cwd: tempRepoDir });

    // Unstaged modification
    await fs.promises.appendFile(fileB, 'unstaged edit\n', 'utf8');

    const scanResult = await performScan(tempRepoDir);
    expect(scanResult.status).toBe('success');
    expect(scanResult.totalCount).toBe(2);

    const changeA = scanResult.changedFiles.find((f) => f.path === 'fileA.ts');
    expect(changeA?.isStaged).toBe(true);
    expect(changeA?.isUnstaged).toBe(false);

    const changeB = scanResult.changedFiles.find((f) => f.path === 'fileB.ts');
    expect(changeB?.isStaged).toBe(false);
    expect(changeB?.isUnstaged).toBe(true);
  });

  // Scenario 6
  it('6. Deleted files are handled without crashing', async () => {
    initGitRepo(tempRepoDir);
    await writeConfig(tempRepoDir, {
      version: 1,
      protectedPaths: ['src/auth/**'],
    });

    const authDir = path.join(tempRepoDir, 'src', 'auth');
    await fs.promises.mkdir(authDir, { recursive: true });
    const authFile = path.join(authDir, 'legacyKey.ts');
    await fs.promises.writeFile(authFile, 'export const key = 123;\n', 'utf8');

    cp.execSync('git add .', { cwd: tempRepoDir });
    cp.execSync('git commit -m "initial"', { cwd: tempRepoDir });

    // Delete the file on disk
    await fs.promises.unlink(authFile);

    const scanResult = await performScan(tempRepoDir);
    expect(scanResult.status).toBe('success');
    expect(scanResult.totalCount).toBe(1);
    expect(scanResult.protectedCount).toBe(1);

    const deletedChange = scanResult.changedFiles[0];
    expect(deletedChange.path).toBe('src/auth/legacyKey.ts');
    expect(deletedChange.isDeleted).toBe(true);
    expect(deletedChange.kind).toBe('protected');

    // Verify tree items route deleted files to showDeletedNotice command
    const treeItems = buildResultsTree(scanResult, tempRepoDir);
    const protectedSection = treeItems.find((i) => i.type === 'section_protected');
    const child = protectedSection?.children?.[0];
    expect(child?.isDeleted).toBe(true);
    expect(child?.commandId).toBe('z-code-guard.showDeletedNotice');
  });

  // Scenario 7
  it('7. Renamed files are classified correctly', async () => {
    initGitRepo(tempRepoDir);
    await writeConfig(tempRepoDir, {
      version: 1,
      protectedPaths: ['src/auth/**'],
    });

    const authDir = path.join(tempRepoDir, 'src', 'auth');
    await fs.promises.mkdir(authDir, { recursive: true });
    const originalFile = path.join(authDir, 'oldAuth.ts');
    await fs.promises.writeFile(originalFile, 'export const auth = true;\n', 'utf8');

    cp.execSync('git add .', { cwd: tempRepoDir });
    cp.execSync('git commit -m "initial"', { cwd: tempRepoDir });

    // Git mv to another directory
    await fs.promises.mkdir(path.join(tempRepoDir, 'src', 'helpers'), { recursive: true });
    cp.execSync('git mv "src/auth/oldAuth.ts" "src/helpers/newAuth.ts"', { cwd: tempRepoDir });

    const scanResult = await performScan(tempRepoDir);
    expect(scanResult.status).toBe('success');
    expect(scanResult.totalCount).toBe(1);
    expect(scanResult.protectedCount).toBe(1);

    const renameChange = scanResult.changedFiles[0];
    expect(renameChange.path).toBe('src/helpers/newAuth.ts');
    expect(renameChange.oldPath).toBe('src/auth/oldAuth.ts');
    expect(renameChange.isRenamed).toBe(true);
    expect(renameChange.kind).toBe('protected');
    expect(renameChange.matchedPatterns).toContain('src/auth/**');
  });

  // Scenario 8
  it('8. Excluded paths are not incorrectly reported as protected changes', async () => {
    initGitRepo(tempRepoDir);
    await writeConfig(tempRepoDir, {
      version: 1,
      protectedPaths: ['src/auth/**', 'node_modules/**'],
      excludePaths: ['node_modules/**', 'src/auth/mock/**'],
    });

    await fs.promises.mkdir(path.join(tempRepoDir, 'src', 'auth', 'mock'), { recursive: true });
    const mockFile = path.join(tempRepoDir, 'src', 'auth', 'mock', 'fakeUser.ts');
    await fs.promises.writeFile(mockFile, 'export const fake = true;\n', 'utf8');

    const authFile = path.join(tempRepoDir, 'src', 'auth', 'realUser.ts');
    await fs.promises.writeFile(authFile, 'export const real = true;\n', 'utf8');

    cp.execSync('git add .', { cwd: tempRepoDir });
    cp.execSync('git commit -m "initial"', { cwd: tempRepoDir });

    // Modify both
    await fs.promises.appendFile(mockFile, '// mock edit\n', 'utf8');
    await fs.promises.appendFile(authFile, '// real edit\n', 'utf8');

    const scanResult = await performScan(tempRepoDir);
    expect(scanResult.status).toBe('success');
    // Only realUser.ts is reported; fakeUser.ts is excluded by precedence
    expect(scanResult.totalCount).toBe(1);
    expect(scanResult.protectedCount).toBe(1);

    const paths = scanResult.changedFiles.map((f) => f.path);
    expect(paths).toContain('src/auth/realUser.ts');
    expect(paths).not.toContain('src/auth/mock/fakeUser.ts');
  });

  // Scenario 9
  it('9. Missing configuration produces an actionable result', async () => {
    initGitRepo(tempRepoDir);
    // Do NOT write .z-code-guard.json

    const scanResult = await performScan(tempRepoDir);
    expect(scanResult.status).toBe('error');
    expect(scanResult.errorCode).toBe('CONFIG_MISSING');
    expect(scanResult.message).toContain('was not found');

    const treeItems = buildResultsTree(scanResult, tempRepoDir);
    expect(treeItems.length).toBe(2);
    expect(treeItems[0].label).toBe('Configuration Missing');
    expect(treeItems[1].label).toBe('Create starter .z-code-guard.json');
    expect(treeItems[1].commandId).toBe('z-code-guard.openConfiguration');
  });

  // Scenario 10
  it('10. Invalid JSON configuration produces an actionable error', async () => {
    initGitRepo(tempRepoDir);
    await writeConfig(tempRepoDir, '{ broken: json, ');

    const scanResult = await performScan(tempRepoDir);
    expect(scanResult.status).toBe('error');
    expect(scanResult.errorCode).toBe('CONFIG_INVALID');
    expect(scanResult.message).toContain('invalid JSON');

    const treeItems = buildResultsTree(scanResult, tempRepoDir);
    expect(treeItems.length).toBe(2);
    expect(treeItems[0].label).toBe('Configuration Invalid');
    expect(treeItems[1].label).toBe('Open configuration to fix errors');
    expect(treeItems[1].commandId).toBe('z-code-guard.openConfiguration');
  });

  // Scenario 11
  it('11. A workspace that is not a Git repository is handled gracefully', async () => {
    // Non-Git folder with valid config
    await writeConfig(tempRepoDir, {
      version: 1,
      protectedPaths: ['src/**'],
    });

    const scanResult = await performScan(tempRepoDir);
    expect(scanResult.status).toBe('error');
    expect(scanResult.errorCode).toBe('NOT_A_GIT_REPO');
    expect(scanResult.message).toContain('not a Git repository');

    const treeItems = buildResultsTree(scanResult, tempRepoDir);
    expect(treeItems.length).toBe(1);
    expect(treeItems[0].label).toBe('Not a Git Repository');
  });

  // Scenario 12
  it('12. Automatic refresh updates the Results Tree View', async () => {
    initGitRepo(tempRepoDir);
    await writeConfig(tempRepoDir, {
      version: 1,
      protectedPaths: ['src/auth/**'],
    });

    const testFile = path.join(tempRepoDir, 'src', 'auth', 'token.ts');
    await fs.promises.mkdir(path.dirname(testFile), { recursive: true });
    await fs.promises.writeFile(testFile, 'export const token = 1;\n', 'utf8');
    cp.execSync('git add .', { cwd: tempRepoDir });
    cp.execSync('git commit -m "init"', { cwd: tempRepoDir });

    const resultsProvider = new ResultsProvider();
    const mockFolder: WorkspaceFolder = {
      uri: Uri.file(tempRepoDir),
      name: 'testRepo',
      index: 0,
    };
    workspace.workspaceFolders = [mockFolder];

    // Set up watcher with short debounce for testing
    const watcherDisposable = setupWorkspaceWatcher(resultsProvider, { debounceDelayMs: 50 });

    // Modify file on disk
    await fs.promises.appendFile(testFile, 'token = 2;\n', 'utf8');

    // Simulate VS Code onDidSaveTextDocument
    _testListeners.saveListeners[0]({ uri: Uri.file(testFile) });

    // Allow debounce timer to fire
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Wait briefly for background scan completion
    await new Promise((resolve) => setTimeout(resolve, 200));

    const treeItems = await resultsProvider.getChildren();
    expect(treeItems.length).toBeGreaterThanOrEqual(2);
    expect(treeItems[0].type).toBe('summary');
    expect(treeItems[0].description).toContain('1 protected');

    watcherDisposable.dispose();
  });

  // Scenario 13
  it('13. Saving .z-code-guard.json refreshes classification', async () => {
    initGitRepo(tempRepoDir);
    // Initially protect NOTHING
    await writeConfig(tempRepoDir, {
      version: 1,
      protectedPaths: ['nonexistent/**'],
    });

    const targetFile = path.join(tempRepoDir, 'src', 'auth', 'session.ts');
    await fs.promises.mkdir(path.dirname(targetFile), { recursive: true });
    await fs.promises.writeFile(targetFile, 'content\n', 'utf8');
    cp.execSync('git add .', { cwd: tempRepoDir });
    cp.execSync('git commit -m "init"', { cwd: tempRepoDir });

    // Modify file
    await fs.promises.appendFile(targetFile, 'change\n', 'utf8');

    const resultsProvider = new ResultsProvider();
    const mockFolder: WorkspaceFolder = {
      uri: Uri.file(tempRepoDir),
      name: 'testRepo',
      index: 0,
    };
    workspace.workspaceFolders = [mockFolder];

    const watcherDisposable = setupWorkspaceWatcher(resultsProvider, { debounceDelayMs: 50 });

    // Initial scan: 0 protected
    await scanWorkspaceCommand(resultsProvider, {
      silent: true,
      targetFolder: mockFolder as unknown as import('vscode').WorkspaceFolder,
    });
    let items = await resultsProvider.getChildren();
    expect(items[0].description).toContain('0 protected');

    // Update .z-code-guard.json to now protect src/auth/**
    await writeConfig(tempRepoDir, {
      version: 1,
      protectedPaths: ['src/auth/**'],
    });

    // Simulate saving .z-code-guard.json
    _testListeners.saveListeners[0]({
      uri: Uri.file(path.join(tempRepoDir, CONFIG_FILE_NAME)),
    });

    // Wait for debounced refresh
    await new Promise((resolve) => setTimeout(resolve, 300));

    // ResultsProvider must now reflect 1 protected file!
    items = await resultsProvider.getChildren();
    expect(items[0].description).toContain('1 protected');

    watcherDisposable.dispose();
  });

  // Scenario 14
  it('14. Debouncing prevents unnecessary repeated scans', async () => {
    initGitRepo(tempRepoDir);
    await writeConfig(tempRepoDir, { version: 1, protectedPaths: ['src/**'] });

    const resultsProvider = new ResultsProvider();
    const mockFolder: WorkspaceFolder = {
      uri: Uri.file(tempRepoDir),
      name: 'testRepo',
      index: 0,
    };
    workspace.workspaceFolders = [mockFolder];

    const setScanResultSpy = vi.spyOn(resultsProvider, 'setScanResult');
    const watcherDisposable = setupWorkspaceWatcher(resultsProvider, { debounceDelayMs: 150 });

    // Trigger 5 rapid saves
    for (let i = 0; i < 5; i++) {
      _testListeners.saveListeners[0]({
        uri: Uri.file(path.join(tempRepoDir, `file_${i}.ts`)),
      });
    }

    // Wait for the single debounced scan to complete
    await new Promise((resolve) => setTimeout(resolve, 350));

    // setScanResult should have been called only once despite 5 rapid save events
    expect(setScanResultSpy).toHaveBeenCalledTimes(1);

    watcherDisposable.dispose();
  });

  // Scenario 15
  it('15. Multiple workspace folders are handled according to existing implementation and documented behavior', async () => {
    initGitRepo(tempRepoDir);
    await writeConfig(tempRepoDir, { version: 1, protectedPaths: ['src/**'] });

    const secondRepoDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'z-second-repo-'));
    try {
      initGitRepo(secondRepoDir);
      await writeConfig(secondRepoDir, { version: 1, protectedPaths: ['pkg/**'] });

      const folder1: WorkspaceFolder = {
        uri: Uri.file(tempRepoDir),
        name: 'Repo1',
        index: 0,
      };
      const folder2: WorkspaceFolder = {
        uri: Uri.file(secondRepoDir),
        name: 'Repo2',
        index: 1,
      };
      workspace.workspaceFolders = [folder1, folder2];

      const resultsProvider = new ResultsProvider();

      // Specifically scan folder 2
      const result = await scanWorkspaceCommand(resultsProvider, {
        silent: true,
        targetFolder: folder2 as unknown as import('vscode').WorkspaceFolder,
      });

      expect(result?.workspaceRoot).toBe(secondRepoDir);
      expect(result?.status).toBe('success');
    } finally {
      await fs.promises.rm(secondRepoDir, { recursive: true, force: true });
    }
  });
});
