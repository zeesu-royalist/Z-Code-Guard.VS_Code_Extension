import { describe, it, expect } from 'vitest';
import {
  parseGitStatus,
  extractAllChangedPaths,
  GitFileChange,
} from '../../src/git/gitStatusParser';

describe('Git Status Parser (parseGitStatus)', () => {
  it('returns an empty array when git status output is empty or whitespace', () => {
    expect(parseGitStatus('')).toEqual([]);
    expect(parseGitStatus('   ')).toEqual([]);
    expect(parseGitStatus('\0\0')).toEqual([]);
  });

  it('parses unstaged modified tracked files', () => {
    // Format: ' M <path>\0'
    const raw = ' M src/auth/session.ts\0';
    const result = parseGitStatus(raw);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      path: 'src/auth/session.ts',
      indexStatus: ' ',
      workTreeStatus: 'M',
      isStaged: false,
      isUnstaged: true,
      isUntracked: false,
      isDeleted: false,
      isRenamed: false,
    });
  });

  it('parses staged modified files', () => {
    // Format: 'M  <path>\0'
    const raw = 'M  src/auth/session.ts\0';
    const result = parseGitStatus(raw);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      path: 'src/auth/session.ts',
      indexStatus: 'M',
      workTreeStatus: ' ',
      isStaged: true,
      isUnstaged: false,
      isUntracked: false,
      isDeleted: false,
      isRenamed: false,
    });
  });

  it('parses files with both staged and unstaged modifications', () => {
    // Format: 'MM <path>\0'
    const raw = 'MM src/auth/session.ts\0';
    const result = parseGitStatus(raw);

    expect(result).toHaveLength(1);
    expect(result[0].isStaged).toBe(true);
    expect(result[0].isUnstaged).toBe(true);
    expect(result[0].indexStatus).toBe('M');
    expect(result[0].workTreeStatus).toBe('M');
  });

  it('parses staged added files', () => {
    // Format: 'A  <path>\0'
    const raw = 'A  src/services/billing.ts\0';
    const result = parseGitStatus(raw);

    expect(result).toHaveLength(1);
    expect(result[0].path).toBe('src/services/billing.ts');
    expect(result[0].isStaged).toBe(true);
    expect(result[0].isUnstaged).toBe(false);
    expect(result[0].isUntracked).toBe(false);
  });

  it('parses untracked non-ignored files', () => {
    // Format: '?? <path>\0'
    const raw = '?? src/utils/untrackedHelper.ts\0';
    const result = parseGitStatus(raw);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      path: 'src/utils/untrackedHelper.ts',
      indexStatus: '?',
      workTreeStatus: '?',
      isStaged: false,
      isUnstaged: false,
      isUntracked: true,
      isDeleted: false,
      isRenamed: false,
    });
  });

  it('parses deleted files (both staged and unstaged)', () => {
    // Unstaged delete: ' D <path>\0', Staged delete: 'D  <path>\0'
    const raw = ' D src/old1.ts\0D  src/old2.ts\0';
    const result = parseGitStatus(raw);

    expect(result).toHaveLength(2);

    expect(result[0].path).toBe('src/old1.ts');
    expect(result[0].isDeleted).toBe(true);
    expect(result[0].isUnstaged).toBe(true);
    expect(result[0].isStaged).toBe(false);

    expect(result[1].path).toBe('src/old2.ts');
    expect(result[1].isDeleted).toBe(true);
    expect(result[1].isStaged).toBe(true);
    expect(result[1].isUnstaged).toBe(false);
  });

  it('parses renamed files and captures destination path and oldPath', () => {
    // Format: 'R  <new_path>\0<old_path>\0'
    const raw = 'R  src/auth/newSession.ts\0src/auth/oldSession.ts\0';
    const result = parseGitStatus(raw);

    expect(result).toHaveLength(1);
    expect(result[0].path).toBe('src/auth/newSession.ts');
    expect(result[0].oldPath).toBe('src/auth/oldSession.ts');
    expect(result[0].isRenamed).toBe(true);
    expect(result[0].isStaged).toBe(true);
  });

  it('handles filenames containing spaces in both new and renamed paths', () => {
    const raw =
      'R  src/payment flow/new checkout.ts\0src/payment flow/old checkout.ts\0?? docs/notes file with spaces.md\0';
    const result = parseGitStatus(raw);

    expect(result).toHaveLength(2);

    // Renamed entry
    expect(result[0].path).toBe('src/payment flow/new checkout.ts');
    expect(result[0].oldPath).toBe('src/payment flow/old checkout.ts');
    expect(result[0].isRenamed).toBe(true);

    // Untracked entry with spaces
    expect(result[1].path).toBe('docs/notes file with spaces.md');
    expect(result[1].isUntracked).toBe(true);
  });

  it('skips ignored files (!!)', () => {
    const raw = '!! node_modules/package/index.js\0 M src/index.ts\0';
    const result = parseGitStatus(raw);

    expect(result).toHaveLength(1);
    expect(result[0].path).toBe('src/index.ts');
  });

  it('normalizes Windows backslashes to standard forward slashes', () => {
    const raw = ' M src\\auth\\session.ts\0R  src\\new.ts\0src\\old.ts\0';
    const result = parseGitStatus(raw);

    expect(result).toHaveLength(2);
    expect(result[0].path).toBe('src/auth/session.ts');
    expect(result[1].path).toBe('src/new.ts');
    expect(result[1].oldPath).toBe('src/old.ts');
  });

  it('safely ignores malformed or truncated items without crashing', () => {
    const raw = 'X\0 M valid.ts\0AB\0';
    const result = parseGitStatus(raw);

    expect(result).toHaveLength(1);
    expect(result[0].path).toBe('valid.ts');
  });

  it('parses multiple mixed change types together in stream order', () => {
    const raw =
      'M  staged.ts\0' +
      ' M unstaged.ts\0' +
      'MM both.ts\0' +
      'A  added.ts\0' +
      ' D deleted.ts\0' +
      'R  new.ts\0old.ts\0' +
      '?? untracked.ts\0';

    const result = parseGitStatus(raw);
    expect(result).toHaveLength(7);

    expect(result.map((r) => r.path)).toEqual([
      'staged.ts',
      'unstaged.ts',
      'both.ts',
      'added.ts',
      'deleted.ts',
      'new.ts',
      'untracked.ts',
    ]);
  });
});

describe('Path Extraction Helper (extractAllChangedPaths)', () => {
  it('extracts all unique paths, including oldPath for renames', () => {
    const changes: GitFileChange[] = [
      {
        path: 'src/auth/session.ts',
        indexStatus: ' ',
        workTreeStatus: 'M',
        isStaged: false,
        isUnstaged: true,
        isUntracked: false,
        isDeleted: false,
        isRenamed: false,
      },
      {
        path: 'src/services/newService.ts',
        oldPath: 'src/services/oldService.ts',
        indexStatus: 'R',
        workTreeStatus: ' ',
        isStaged: true,
        isUnstaged: false,
        isUntracked: false,
        isDeleted: false,
        isRenamed: true,
      },
    ];

    const extracted = extractAllChangedPaths(changes);
    expect(extracted).toEqual([
      'src/auth/session.ts',
      'src/services/newService.ts',
      'src/services/oldService.ts',
    ]);
  });
});
