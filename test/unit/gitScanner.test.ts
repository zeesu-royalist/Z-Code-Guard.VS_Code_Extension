import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as cp from 'child_process';
import {
  checkGitInstalled,
  checkIsGitRepository,
  scanGitStatus,
} from '../../src/git/gitScanner';

describe('Git Scanner (gitScanner)', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'z-git-scanner-test-'));
  });

  afterEach(async () => {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  });

  it('detects that Git CLI is installed on this system', async () => {
    const result = await checkGitInstalled();
    expect(result.installed).toBe(true);
    expect(result.version).toBeDefined();
    expect(result.version).toContain('git version');
  });

  it('correctly reports that a non-Git folder is not a repository', async () => {
    const repoCheck = await checkIsGitRepository(tempDir);
    expect(repoCheck.isRepo).toBe(false);

    const scanResult = await scanGitStatus(tempDir);
    expect(scanResult.status).toBe('not_a_repository');
    expect(scanResult.isGitInstalled).toBe(true);
    expect(scanResult.isGitRepository).toBe(false);
  });

  it('detects real Git changes (staged, modified, renamed with spaces, untracked) in a repository', async () => {
    // 1. Initialize temporary Git repository
    cp.execSync('git init', { cwd: tempDir });
    cp.execSync('git config user.email test@zcodeguard.local', { cwd: tempDir });
    cp.execSync('git config user.name "Z-Code-Guard Test"', { cwd: tempDir });

    // 2. Commit initial files
    const trackedFilePath = path.join(tempDir, 'tracked.ts');
    const oldFilePath = path.join(tempDir, 'old name.ts');
    await fs.promises.writeFile(trackedFilePath, 'const initial = 1;\n', 'utf8');
    await fs.promises.writeFile(oldFilePath, 'export const oldCode = true;\n', 'utf8');
    cp.execSync('git add .', { cwd: tempDir });
    cp.execSync('git commit -m "initial commit"', { cwd: tempDir });

    // 3. Make working tree changes:
    // a. Modify tracked.ts (unstaged)
    await fs.promises.appendFile(trackedFilePath, 'const modified = 2;\n', 'utf8');

    // b. Rename old name.ts -> new name.ts (staged rename)
    cp.execSync('git mv "old name.ts" "new name.ts"', { cwd: tempDir });

    // c. Add a new file to staging (staged add)
    const stagedPath = path.join(tempDir, 'stagedNew.ts');
    await fs.promises.writeFile(stagedPath, 'export const staged = true;\n', 'utf8');
    cp.execSync('git add stagedNew.ts', { cwd: tempDir });

    // d. Create untracked file (untracked)
    const untrackedPath = path.join(tempDir, 'untracked file.ts');
    await fs.promises.writeFile(untrackedPath, 'export const untracked = true;\n', 'utf8');

    // 4. Run scanGitStatus
    const result = await scanGitStatus(tempDir);
    expect(result.status).toBe('success');

    if (result.status === 'success') {
      expect(result.isGitInstalled).toBe(true);
      expect(result.isGitRepository).toBe(true);
      expect(result.changes.length).toBe(4);

      const paths = result.changes.map((c) => c.path);
      expect(paths).toContain('tracked.ts');
      expect(paths).toContain('new name.ts');
      expect(paths).toContain('stagedNew.ts');
      expect(paths).toContain('untracked file.ts');

      const renameChange = result.changes.find((c) => c.path === 'new name.ts');
      expect(renameChange?.isRenamed).toBe(true);
      expect(renameChange?.oldPath).toBe('old name.ts');

      const untrackedChange = result.changes.find((c) => c.path === 'untracked file.ts');
      expect(untrackedChange?.isUntracked).toBe(true);

      const modifiedChange = result.changes.find((c) => c.path === 'tracked.ts');
      expect(modifiedChange?.isUnstaged).toBe(true);

      const stagedChange = result.changes.find((c) => c.path === 'stagedNew.ts');
      expect(stagedChange?.isStaged).toBe(true);
    }
  });
});
