import { describe, it, expect, beforeEach } from 'vitest';
import {
  baselineStore,
  compareWithBaseline,
  createDiagnosticKey,
} from '../../src/analysis/diagnosticsTracker';
import { FileDiagnostic } from '../../src/models/scanResult';

describe('Diagnostics Tracker (diagnosticsTracker)', () => {
  const workspaceRoot = '/test/workspace';

  beforeEach(() => {
    baselineStore.clear();
  });

  it('generates consistent diagnostic keys', () => {
    const key1 = createDiagnosticKey({
      filePath: 'src/app.ts',
      message: 'Type error: number is not assignable to string',
      startLine: 15,
      code: 2322,
    });

    const key2 = createDiagnosticKey({
      filePath: 'src/app.ts',
      message: 'Type error: number is not assignable to string',
      startLine: 15,
      code: 2322,
    });

    expect(key1).toBe(key2);
  });

  it('classifies all diagnostics as pre_existing when no baseline exists', () => {
    const current: FileDiagnostic[] = [
      {
        filePath: 'src/main.ts',
        message: 'Cannot find name x',
        severity: 'error',
        startLine: 10,
        startCharacter: 5,
        endLine: 10,
        endCharacter: 6,
        baselineStatus: 'pre_existing',
      },
    ];

    const result = compareWithBaseline(workspaceRoot, current);
    expect(result.hasBaseline).toBe(false);
    expect(result.newErrorsCount).toBe(0);
    expect(result.preExistingErrorsCount).toBe(1);
    expect(result.activeDiagnostics[0].baselineStatus).toBe('pre_existing');
  });

  it('accurately identifies new, pre-existing, and resolved errors against baseline', () => {
    // 1. Set baseline: Error on line 10
    const baselineDiag: FileDiagnostic = {
      filePath: 'src/main.ts',
      message: 'Old error',
      severity: 'error',
      startLine: 10,
      startCharacter: 1,
      endLine: 10,
      endCharacter: 5,
      baselineStatus: 'pre_existing',
    };
    baselineStore.setBaseline(workspaceRoot, [baselineDiag]);

    // 2. Current state: Old error resolved, new error introduced on line 20
    const newDiag: FileDiagnostic = {
      filePath: 'src/main.ts',
      message: 'New type error',
      severity: 'error',
      startLine: 20,
      startCharacter: 1,
      endLine: 20,
      endCharacter: 5,
      baselineStatus: 'pre_existing',
    };

    const result = compareWithBaseline(workspaceRoot, [newDiag]);
    expect(result.hasBaseline).toBe(true);
    expect(result.newErrorsCount).toBe(1);
    expect(result.resolvedCount).toBe(1);
    expect(result.activeDiagnostics[0].baselineStatus).toBe('new');
    expect(result.resolvedDiagnostics[0].baselineStatus).toBe('resolved');
  });
});
