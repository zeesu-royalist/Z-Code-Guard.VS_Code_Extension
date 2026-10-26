import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as cp from 'child_process';
import { performScan } from '../../src/analysis/scanService';
import { CONFIG_FILE_NAME } from '../../src/config/configSchema';

describe('Scan Service Orchestrator (performScan)', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'z-scan-service-test-'));
  });

  afterEach(async () => {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  });

  it('fails with NO_WORKSPACE when workspace path is empty', async () => {
    const result = await performScan('');
    expect(result.status).toBe('error');
    expect(result.errorCode).toBe('NO_WORKSPACE');
    expect(result.totalCount).toBe(0);
    expect(result.protectedCount).toBe(0);
  });

  it('fails with CONFIG_MISSING when .z-code-guard.json is missing', async () => {
    const result = await performScan(tempDir);
    expect(result.status).toBe('error');
    expect(result.errorCode).toBe('CONFIG_MISSING');
    expect(result.message).toContain('was not found');
  });

  it('fails with CONFIG_INVALID when configuration contains invalid JSON', async () => {
    await fs.promises.writeFile(
      path.join(tempDir, CONFIG_FILE_NAME),
      '{ broken: json, ',
      'utf8'
    );

    const result = await performScan(tempDir);
    expect(result.status).toBe('error');
    expect(result.errorCode).toBe('CONFIG_INVALID');
  });

  it('fails with NOT_A_GIT_REPO when workspace is not a Git repository', async () => {
    // Write valid config in a non-git directory
    await fs.promises.writeFile(
      path.join(tempDir, CONFIG_FILE_NAME),
      JSON.stringify({
        version: 1,
        protectedPaths: ['src/**'],
      }),
      'utf8'
    );

    const result = await performScan(tempDir);
    expect(result.status).toBe('error');
    expect(result.errorCode).toBe('NOT_A_GIT_REPO');
    expect(result.message).toContain('not a Git repository');
  });

  it('accurately scans a Git repository, classifies protected and other files, and respects exclusions', async () => {
    // 1. Initialize Git repository
    cp.execSync('git init', { cwd: tempDir });
    cp.execSync('git config user.email test@zcodeguard.local', { cwd: tempDir });
    cp.execSync('git config user.name "Z-Code-Guard Scan Test"', { cwd: tempDir });

    // 2. Write valid .z-code-guard.json
    const configData = {
      version: 1,
      protectedPaths: ['src/auth/**', 'src/services/**'],
      excludePaths: ['node_modules/**', 'dist/**', 'src/auth/mock/**'],
    };
    await fs.promises.writeFile(
      path.join(tempDir, CONFIG_FILE_NAME),
      JSON.stringify(configData, null, 2),
      'utf8'
    );

    // 3. Create initial source directories & files
    await fs.promises.mkdir(path.join(tempDir, 'src', 'auth'), { recursive: true });
    await fs.promises.mkdir(path.join(tempDir, 'src', 'auth', 'mock'), { recursive: true });
    await fs.promises.mkdir(path.join(tempDir, 'src', 'components'), { recursive: true });
    await fs.promises.mkdir(path.join(tempDir, 'dist'), { recursive: true });

    const authFile = path.join(tempDir, 'src', 'auth', 'session.ts');
    await fs.promises.writeFile(authFile, 'export const initial = 1;\n', 'utf8');

    cp.execSync('git add .', { cwd: tempDir });
    cp.execSync('git commit -m "initial commit"', { cwd: tempDir });

    // 4. Introduce various changes:
    // a. Modify protected file (src/auth/session.ts) -> should be 'protected'
    await fs.promises.appendFile(authFile, 'export const updated = 2;\n', 'utf8');

    // b. Add an untracked UI file (src/components/Button.tsx) -> should be 'other'
    await fs.promises.writeFile(
      path.join(tempDir, 'src', 'components', 'Button.tsx'),
      'export const Button = () => null;\n',
      'utf8'
    );

    // c. Add an untracked file under excluded directory (src/auth/mock/fakeUser.ts) -> should be EXCLUDED
    await fs.promises.writeFile(
      path.join(tempDir, 'src', 'auth', 'mock', 'fakeUser.ts'),
      'export const fake = true;\n',
      'utf8'
    );

    // d. Add an untracked file under dist/ -> should be EXCLUDED
    await fs.promises.writeFile(
      path.join(tempDir, 'dist', 'output.js'),
      'console.log(1);\n',
      'utf8'
    );

    // 5. Run performScan
    const scanResult = await performScan(tempDir);

    expect(scanResult.status).toBe('success');
    expect(scanResult.totalCount).toBe(2);
    expect(scanResult.protectedCount).toBe(1);

    const paths = scanResult.changedFiles.map((f) => f.path);
    // Excluded paths must NOT be present
    expect(paths).not.toContain('src/auth/mock/fakeUser.ts');
    expect(paths).not.toContain('dist/output.js');

    // Included paths
    expect(paths).toContain('src/auth/session.ts');
    expect(paths).toContain('src/components/Button.tsx');

    const authResult = scanResult.changedFiles.find((f) => f.path === 'src/auth/session.ts');
    expect(authResult?.kind).toBe('protected');
    expect(authResult?.matchedPatterns).toContain('src/auth/**');

    const buttonResult = scanResult.changedFiles.find((f) => f.path === 'src/components/Button.tsx');
    expect(buttonResult?.kind).toBe('other');
    expect(buttonResult?.matchedPatterns).toEqual([]);
  });
});
