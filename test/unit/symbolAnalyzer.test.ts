import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  extractSymbolsFromSource,
  identifyChangedSymbols,
  isSymbolAnalysisSupported,
} from '../../src/analysis/symbolAnalyzer';
import { GitDiffHunk } from '../../src/git/gitDiffScanner';

describe('Symbol Analyzer (symbolAnalyzer)', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'z-sym-test-'));
  });

  afterEach(async () => {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  });

  it('checks supported file extensions accurately', () => {
    expect(isSymbolAnalysisSupported('app.ts')).toBe(true);
    expect(isSymbolAnalysisSupported('src/Button.tsx')).toBe(true);
    expect(isSymbolAnalysisSupported('server.js')).toBe(true);
    expect(isSymbolAnalysisSupported('main.py')).toBe(false);
    expect(isSymbolAnalysisSupported('style.css')).toBe(false);
  });

  it('extracts functions, classes, interfaces, and exported symbols from source code', () => {
    const source = `
import { helper } from './helper';

export interface UserSession {
  id: string;
  token: string;
}

export type AuthMode = 'jwt' | 'cookie';

export class AuthService {
  public validateToken(token: string) {
    return token.length > 0;
  }
}

export function loginUser(email: string) {
  return true;
}

const formatEmail = (email: string) => {
  return email.toLowerCase();
};
`;

    const symbols = extractSymbolsFromSource(source);
    const names = symbols.map((s) => s.name);

    expect(names).toContain('UserSession');
    expect(names).toContain('AuthMode');
    expect(names).toContain('AuthService');
    expect(names).toContain('AuthService.validateToken');
    expect(names).toContain('loginUser');
    expect(names).toContain('formatEmail');

    const iface = symbols.find((s) => s.name === 'UserSession');
    expect(iface?.kind).toBe('interface');
    expect(iface?.isExported).toBe(true);

    const func = symbols.find((s) => s.name === 'loginUser');
    expect(func?.kind).toBe('function');
    expect(func?.isExported).toBe(true);
  });

  it('identifies changed symbols overlapping with diff hunks', async () => {
    const filePath = 'src/service.ts';
    const fullPath = path.join(tempDir, filePath);
    await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });

    const source = `// line 1
export function firstFunc() {
  return 1;
}

export function secondFunc() {
  const x = 2;
  return x * 10;
}
`;
    await fs.promises.writeFile(fullPath, source, 'utf8');

    // Hunk touching lines 7 and 8 (inside secondFunc)
    const hunk: GitDiffHunk = {
      oldStart: 6,
      oldCount: 3,
      newStart: 6,
      newCount: 4,
      header: '@@ -6,3 +6,4 @@',
      addedLines: [7, 8],
      deletedLines: [],
      lines: ['+  const x = 20;', '+  return x * 100;'],
    };

    const changed = await identifyChangedSymbols(filePath, fullPath, [hunk]);
    expect(changed).toHaveLength(1);
    expect(changed[0].name).toBe('secondFunc');
  });
});
