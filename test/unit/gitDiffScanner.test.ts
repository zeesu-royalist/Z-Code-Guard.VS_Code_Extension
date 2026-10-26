import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as cp from 'child_process';
import {
  parseUnifiedDiff,
  parseNumstatOutput,
  getFileDiff,
  getWorkspaceDiffStats,
} from '../../src/git/gitDiffScanner';

describe('Git Diff Scanner (gitDiffScanner)', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'z-diff-test-'));
    cp.execSync('git init', { cwd: tempDir });
    cp.execSync('git config user.email test@zcodeguard.local', { cwd: tempDir });
    cp.execSync('git config user.name "Diff Tester"', { cwd: tempDir });
  });

  afterEach(async () => {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  });

  it('parses unified diff hunks correctly', () => {
    const rawDiff = `--- a/src/app.ts
+++ b/src/app.ts
@@ -10,3 +10,5 @@
 const a = 1;
-const b = 2;
+const b = 20;
+const c = 30;
 const d = 4;
`;

    const hunks = parseUnifiedDiff(rawDiff);
    expect(hunks).toHaveLength(1);

    const hunk = hunks[0];
    expect(hunk.oldStart).toBe(10);
    expect(hunk.oldCount).toBe(3);
    expect(hunk.newStart).toBe(10);
    expect(hunk.newCount).toBe(5);
    expect(hunk.deletedLines).toContain(11);
    expect(hunk.addedLines).toContain(11);
    expect(hunk.addedLines).toContain(12);
  });

  it('parses git diff --numstat output correctly', () => {
    const rawNumstat = `12\t4\tsrc/auth/session.ts
0\t5\tsrc/legacy.ts
-\t-\timages/logo.png
`;

    const stats = parseNumstatOutput(rawNumstat);
    expect(stats.get('src/auth/session.ts')).toEqual({ additions: 12, deletions: 4 });
    expect(stats.get('src/legacy.ts')).toEqual({ additions: 0, deletions: 5 });
    expect(stats.get('images/logo.png')).toEqual({ additions: 0, deletions: 0 });
  });

  it('retrieves accurate diff for modified and untracked files in a Git repository', async () => {
    const initialFile = path.join(tempDir, 'file.txt');
    await fs.promises.writeFile(initialFile, 'line 1\nline 2\nline 3\n', 'utf8');

    cp.execSync('git add file.txt', { cwd: tempDir });
    cp.execSync('git commit -m "initial"', { cwd: tempDir });

    // 1. Modify file.txt
    await fs.promises.writeFile(initialFile, 'line 1\nline 2 MODIFIED\nline 3\nline 4 ADDED\n', 'utf8');

    // 2. Add untracked file
    const untrackedFile = path.join(tempDir, 'new.txt');
    await fs.promises.writeFile(untrackedFile, 'new line 1\nnew line 2\n', 'utf8');

    // Diff modified file
    const modDiff = await getFileDiff(tempDir, 'file.txt');
    expect(modDiff.additions).toBeGreaterThan(0);
    expect(modDiff.deletions).toBeGreaterThan(0);
    expect(modDiff.hunks.length).toBeGreaterThan(0);

    // Diff untracked file
    const untrackedDiff = await getFileDiff(tempDir, 'new.txt', { isUntracked: true });
    expect(untrackedDiff.additions).toBe(2);
    expect(untrackedDiff.deletions).toBe(0);
    expect(untrackedDiff.hunks[0].addedLines).toEqual([1, 2]);

    // Workspace diff stats
    const stats = await getWorkspaceDiffStats(tempDir);
    expect(stats.has('file.txt')).toBe(true);
  });
});
