import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  analyzeWorkspaceImpact,
  getImportBaseNames,
  isTestFile,
} from '../../src/analysis/impactAnalyzer';
import { ChangedFile } from '../../src/models/scanResult';

describe('Impact Analyzer (impactAnalyzer)', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'z-impact-test-'));
  });

  afterEach(async () => {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  });

  it('determines test files accurately', () => {
    expect(isTestFile('test/unit/auth.test.ts')).toBe(true);
    expect(isTestFile('src/__tests__/Button.spec.tsx')).toBe(true);
    expect(isTestFile('src/auth/session.ts')).toBe(false);
  });

  it('extracts import base names correctly', () => {
    const bases = getImportBaseNames('src/services/billingService.ts');
    expect(bases).toContain('src/services/billingService');
    expect(bases).toContain('billingService');
  });

  it('discovers verified imports and test callers of changed exported symbols', async () => {
    // 1. Create target service file
    await fs.promises.mkdir(path.join(tempDir, 'src', 'auth'), { recursive: true });
    await fs.promises.writeFile(
      path.join(tempDir, 'src', 'auth', 'authService.ts'),
      'export function verifyToken() { return true; }\n',
      'utf8'
    );

    // 2. Create consumer file importing target
    await fs.promises.mkdir(path.join(tempDir, 'src', 'api'), { recursive: true });
    await fs.promises.writeFile(
      path.join(tempDir, 'src', 'api', 'loginHandler.ts'),
      `import { verifyToken } from '../auth/authService';\nexport const handle = () => verifyToken();\n`,
      'utf8'
    );

    // 3. Create test file
    await fs.promises.mkdir(path.join(tempDir, 'test'), { recursive: true });
    await fs.promises.writeFile(
      path.join(tempDir, 'test', 'auth.test.ts'),
      `import { verifyToken } from '../src/auth/authService';\n`,
      'utf8'
    );

    const changedTarget: ChangedFile = {
      path: 'src/auth/authService.ts',
      kind: 'protected',
      matchedPatterns: ['src/auth/**'],
      isStaged: false,
      isUnstaged: true,
      isUntracked: false,
      isDeleted: false,
      isRenamed: false,
      symbols: [
        {
          name: 'verifyToken',
          kind: 'function',
          startLine: 1,
          endLine: 1,
          isExported: true,
        },
      ],
    };

    const impact = await analyzeWorkspaceImpact(tempDir, [changedTarget]);
    const references = impact.get('src/auth/authService.ts') || [];

    expect(references.length).toBeGreaterThanOrEqual(2);

    const consumerRef = references.find((r) => r.referencingFile === 'src/api/loginHandler.ts');
    expect(consumerRef).toBeDefined();
    expect(consumerRef?.referenceType).toBe('verified_import');
    expect(consumerRef?.isVerified).toBe(true);

    const testRef = references.find((r) => r.referencingFile === 'test/auth.test.ts');
    expect(testRef).toBeDefined();
    expect(testRef?.referenceType).toBe('test_file');
  });
});
