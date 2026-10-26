import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as cp from 'child_process';
import { performScan } from '../../src/analysis/scanService';

describe('Unconfigured Workspace Scanning (Phase Six)', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'z-unconfigured-test-'));
    cp.execSync('git init', { cwd: tempDir });
    cp.execSync('git config user.email test@zcodeguard.local', { cwd: tempDir });
    cp.execSync('git config user.name "Unconfigured Tester"', { cwd: tempDir });
  });

  afterEach(async () => {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  });

  it('scans Git changes without requiring .z-code-guard.json when allowUnconfigured is true', async () => {
    // Note: No .z-code-guard.json is written
    const file1 = path.join(tempDir, 'src', 'index.ts');
    await fs.promises.mkdir(path.dirname(file1), { recursive: true });
    await fs.promises.writeFile(file1, 'export const hello = "world";\n', 'utf8');

    cp.execSync('git add .', { cwd: tempDir });
    cp.execSync('git commit -m "initial"', { cwd: tempDir });

    // Modify index.ts
    await fs.promises.appendFile(file1, 'export const goodbye = "world";\n', 'utf8');

    // Add untracked helper.ts
    await fs.promises.writeFile(
      path.join(tempDir, 'src', 'helper.ts'),
      'export const help = true;\n',
      'utf8'
    );

    const scanResult = await performScan(tempDir, { allowUnconfigured: true });

    expect(scanResult.status).toBe('success');
    expect(scanResult.isConfigured).toBe(false);
    expect(scanResult.totalCount).toBe(2);
    expect(scanResult.protectedCount).toBe(0);

    const paths = scanResult.changedFiles.map((f) => f.path);
    expect(paths).toContain('src/index.ts');
    expect(paths).toContain('src/helper.ts');

    for (const f of scanResult.changedFiles) {
      expect(f.kind).toBe('other');
    }
  });
});
