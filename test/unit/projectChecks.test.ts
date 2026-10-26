import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { discoverProjectChecks } from '../../src/analysis/projectChecks';

describe('Project Checks Discovery (projectChecks)', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'z-checks-test-'));
  });

  afterEach(async () => {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  });

  it('discovers typecheck, lint, test, and build scripts safely from package.json', async () => {
    const pkg = {
      scripts: {
        typecheck: 'tsc --noEmit',
        lint: 'eslint .',
        test: 'vitest run',
        build: 'tsc -p ./',
      },
    };

    await fs.promises.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify(pkg, null, 2),
      'utf8'
    );

    const checks = await discoverProjectChecks(tempDir);
    expect(checks).toHaveLength(4);

    const names = checks.map((c) => c.type);
    expect(names).toContain('typecheck');
    expect(names).toContain('lint');
    expect(names).toContain('test');
    expect(names).toContain('build');

    for (const check of checks) {
      expect(check.status).toBe('idle');
      expect(check.isAvailable).toBe(true);
    }
  });

  it('returns empty array when package.json does not exist', async () => {
    const checks = await discoverProjectChecks(tempDir);
    expect(checks).toEqual([]);
  });
});
