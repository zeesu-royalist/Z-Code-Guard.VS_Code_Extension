import { describe, it, expect } from 'vitest';
import {
  normalizePath,
  matchesPattern,
  isPathExcluded,
  findMatchingProtectedPatterns,
  classifyFile,
} from '../../src/analysis/pathMatcher';
import { ZCodeGuardConfig } from '../../src/config/configSchema';
import { GitFileChange } from '../../src/git/gitStatusParser';

describe('Path Normalizer (normalizePath)', () => {
  it('normalizes backslashes to forward slashes and trims leading slashes', () => {
    expect(normalizePath('src\\auth\\session.ts')).toBe('src/auth/session.ts');
    expect(normalizePath('./src/services/api.ts')).toBe('src/services/api.ts');
    expect(normalizePath('/src/pages/index.tsx')).toBe('src/pages/index.tsx');
    expect(normalizePath('   src/auth/token.ts   ')).toBe('src/auth/token.ts');
    expect(normalizePath('')).toBe('');
  });
});

describe('Path & Glob Matcher (matchesPattern)', () => {
  it('matches exact file paths', () => {
    expect(matchesPattern('src/auth/session.ts', 'src/auth/session.ts')).toBe(true);
    expect(matchesPattern('src/auth/session.ts', 'src/auth/other.ts')).toBe(false);
  });

  it('matches globstar recursive patterns (e.g. src/auth/**)', () => {
    expect(matchesPattern('src/auth/session.ts', 'src/auth/**')).toBe(true);
    expect(matchesPattern('src/auth/deep/nested/token.ts', 'src/auth/**')).toBe(true);
    expect(matchesPattern('src/author/book.ts', 'src/auth/**')).toBe(false);
    expect(matchesPattern('src/pages/auth.ts', 'src/auth/**')).toBe(false);
  });

  it('matches directory prefix without wildcards (e.g. src/auth or src/auth/)', () => {
    expect(matchesPattern('src/auth/session.ts', 'src/auth')).toBe(true);
    expect(matchesPattern('src/auth/session.ts', 'src/auth/')).toBe(true);
    expect(matchesPattern('src/author/book.ts', 'src/auth')).toBe(false);
  });

  it('matches double-star wildcard anywhere in path (e.g. **/payment/**)', () => {
    expect(matchesPattern('src/payment/checkout.ts', '**/payment/**')).toBe(true);
    expect(matchesPattern('nested/deep/payment/api.ts', '**/payment/**')).toBe(true);
    expect(matchesPattern('payment/invoice.ts', '**/payment/**')).toBe(true);
    expect(matchesPattern('src/billing/other.ts', '**/payment/**')).toBe(false);
  });

  it('matches single wildcard within directory segment (*.ts)', () => {
    expect(matchesPattern('index.ts', '*.ts')).toBe(true);
    expect(matchesPattern('src/index.ts', '*.ts')).toBe(false);
    expect(matchesPattern('src/index.ts', 'src/*.ts')).toBe(true);
    expect(matchesPattern('src/auth/index.ts', 'src/*.ts')).toBe(false);
  });

  it('handles paths and patterns containing spaces', () => {
    expect(
      matchesPattern(
        'src/payment flow/checkout service.ts',
        'src/payment flow/**'
      )
    ).toBe(true);
    expect(
      matchesPattern(
        'docs/developer notes.md',
        'docs/*.md'
      )
    ).toBe(true);
  });

  it('matches case-insensitively for reliable cross-platform behavior', () => {
    expect(matchesPattern('src/Auth/Session.ts', 'src/auth/**')).toBe(true);
    expect(matchesPattern('src/AUTH/SESSION.TS', 'src/auth/session.ts')).toBe(true);
  });
});

describe('Exclusion & Precedence (isPathExcluded & classifyFile)', () => {
  const testConfig: ZCodeGuardConfig = {
    version: 1,
    protectedPaths: [
      'src/auth/**',
      'src/services/**',
      'src/config/secrets.ts',
    ],
    excludePaths: [
      'node_modules/**',
      'dist/**',
      'src/auth/mock/**',
      '**/*.spec.ts',
    ],
  };

  it('correctly identifies excluded paths', () => {
    expect(isPathExcluded('node_modules/pkg/index.js', testConfig.excludePaths)).toBe(true);
    expect(isPathExcluded('dist/bundle.js', testConfig.excludePaths)).toBe(true);
    expect(isPathExcluded('src/auth/mock/fakeUser.ts', testConfig.excludePaths)).toBe(true);
    expect(isPathExcluded('src/auth/session.ts', testConfig.excludePaths)).toBe(false);
  });

  it('PRECEDENCE RULE: Excluded path takes precedence over protected path', () => {
    // 'src/auth/mock/fakeUser.ts' matches protected 'src/auth/**' BUT ALSO matches excluded 'src/auth/mock/**'
    const change: GitFileChange = {
      path: 'src/auth/mock/fakeUser.ts',
      indexStatus: ' ',
      workTreeStatus: 'M',
      isStaged: false,
      isUnstaged: true,
      isUntracked: false,
      isDeleted: false,
      isRenamed: false,
    };

    const result = classifyFile(change, testConfig);
    expect(result.isExcluded).toBe(true);
    expect(result.changedFile).toBeUndefined();
  });

  it('classifies protected files correctly and lists matched patterns', () => {
    const change: GitFileChange = {
      path: 'src/auth/session.ts',
      indexStatus: 'M',
      workTreeStatus: ' ',
      isStaged: true,
      isUnstaged: false,
      isUntracked: false,
      isDeleted: false,
      isRenamed: false,
    };

    const result = classifyFile(change, testConfig);
    expect(result.isExcluded).toBe(false);
    expect(result.changedFile?.kind).toBe('protected');
    expect(result.changedFile?.matchedPatterns).toEqual(['src/auth/**']);
  });

  it('classifies non-matching changes as other', () => {
    const change: GitFileChange = {
      path: 'src/components/Header.tsx',
      indexStatus: '?',
      workTreeStatus: '?',
      isStaged: false,
      isUnstaged: false,
      isUntracked: true,
      isDeleted: false,
      isRenamed: false,
    };

    const result = classifyFile(change, testConfig);
    expect(result.isExcluded).toBe(false);
    expect(result.changedFile?.kind).toBe('other');
    expect(result.changedFile?.matchedPatterns).toEqual([]);
  });

  it('classifies renamed files as protected if destination OR original path matches', () => {
    // 1. Destination is protected
    const change1: GitFileChange = {
      path: 'src/auth/newSession.ts',
      oldPath: 'src/temp/oldSession.ts',
      indexStatus: 'R',
      workTreeStatus: ' ',
      isStaged: true,
      isUnstaged: false,
      isUntracked: false,
      isDeleted: false,
      isRenamed: true,
    };
    const result1 = classifyFile(change1, testConfig);
    expect(result1.changedFile?.kind).toBe('protected');
    expect(result1.changedFile?.matchedPatterns).toContain('src/auth/**');

    // 2. Original path was protected (e.g. moving a protected auth file elsewhere)
    const change2: GitFileChange = {
      path: 'src/unprotected/movedFile.ts',
      oldPath: 'src/auth/originalFile.ts',
      indexStatus: 'R',
      workTreeStatus: ' ',
      isStaged: true,
      isUnstaged: false,
      isUntracked: false,
      isDeleted: false,
      isRenamed: true,
    };
    const result2 = classifyFile(change2, testConfig);
    expect(result2.changedFile?.kind).toBe('protected');
    expect(result2.changedFile?.matchedPatterns).toContain('src/auth/**');
  });
});
