import { describe, it, expect } from 'vitest';
import { evaluateRiskFindings, redactSecretValue } from '../../src/analysis/riskEngine';
import { ChangedFile } from '../../src/models/scanResult';

describe('Risk Engine (riskEngine)', () => {
  it('redacts secret and token values from evidence strings', () => {
    const raw1 = `const API_KEY = "sk_live_1234567890abcdef";`;
    const redacted1 = redactSecretValue(raw1);
    expect(redacted1).not.toContain('sk_live_1234567890abcdef');
    expect(redacted1).toContain('sk****');

    const raw2 = `headers: { token: 'supersecretjwt123' }`;
    const redacted2 = redactSecretValue(raw2);
    expect(redacted2).not.toContain('supersecretjwt123');
  });

  it('detects authentication and token logic changes', () => {
    const file: ChangedFile = {
      path: 'src/auth/jwt.ts',
      kind: 'other',
      matchedPatterns: [],
      isStaged: false,
      isUnstaged: true,
      isUntracked: false,
      isDeleted: false,
      isRenamed: false,
      diff: {
        path: 'src/auth/jwt.ts',
        additions: 1,
        deletions: 0,
        isBinary: false,
        rawDiff: '',
        hunks: [
          {
            oldStart: 1,
            oldCount: 1,
            newStart: 1,
            newCount: 2,
            header: '@@ -1,1 +1,2 @@',
            addedLines: [2],
            deletedLines: [],
            lines: ['+const token = jwt.sign(payload, secret);'],
          },
        ],
      },
    };

    const findings = evaluateRiskFindings([file]);
    const authFinding = findings.find((f) => f.ruleId === 'AUTH_CHANGE');
    expect(authFinding).toBeDefined();
    expect(authFinding?.severity).toBe('high');
    expect(authFinding?.confidence).toBe('confirmed');
  });

  it('detects permission and role check changes', () => {
    const file: ChangedFile = {
      path: 'src/middleware/guard.ts',
      kind: 'other',
      matchedPatterns: [],
      isStaged: false,
      isUnstaged: true,
      isUntracked: false,
      isDeleted: false,
      isRenamed: false,
      diff: {
        path: 'src/middleware/guard.ts',
        additions: 1,
        deletions: 0,
        isBinary: false,
        rawDiff: '',
        hunks: [
          {
            oldStart: 5,
            oldCount: 1,
            newStart: 5,
            newCount: 2,
            header: '@@ -5,1 +5,2 @@',
            addedLines: [6],
            deletedLines: [],
            lines: ["+if (role === 'admin' || hasPermission(user, 'write')) {"],
          },
        ],
      },
    };

    const findings = evaluateRiskFindings([file]);
    const permFinding = findings.find((f) => f.ruleId === 'PERMISSION_CHECK');
    expect(permFinding).toBeDefined();
    expect(permFinding?.severity).toBe('high');
  });

  it('detects payment gateway calls and financial operations', () => {
    const file: ChangedFile = {
      path: 'src/billing/checkout.ts',
      kind: 'other',
      matchedPatterns: [],
      isStaged: false,
      isUnstaged: true,
      isUntracked: false,
      isDeleted: false,
      isRenamed: false,
      diff: {
        path: 'src/billing/checkout.ts',
        additions: 1,
        deletions: 0,
        isBinary: false,
        rawDiff: '',
        hunks: [
          {
            oldStart: 10,
            oldCount: 1,
            newStart: 10,
            newCount: 2,
            header: '@@ -10,1 +10,2 @@',
            addedLines: [11],
            deletedLines: [],
            lines: ['+const payment = await stripe.paymentIntents.create({ amount });'],
          },
        ],
      },
    };

    const findings = evaluateRiskFindings([file]);
    const payFinding = findings.find((f) => f.ruleId === 'PAYMENT_TRANSACTION');
    expect(payFinding).toBeDefined();
    expect(payFinding?.severity).toBe('high');
  });

  it('detects destructive operation patterns (DROP TABLE / rmSync)', () => {
    const file: ChangedFile = {
      path: 'src/cleaner.ts',
      kind: 'other',
      matchedPatterns: [],
      isStaged: false,
      isUnstaged: true,
      isUntracked: false,
      isDeleted: false,
      isRenamed: false,
      diff: {
        path: 'src/cleaner.ts',
        additions: 1,
        deletions: 0,
        isBinary: false,
        rawDiff: '',
        hunks: [
          {
            oldStart: 1,
            oldCount: 1,
            newStart: 1,
            newCount: 2,
            header: '@@ -1,1 +1,2 @@',
            addedLines: [2],
            deletedLines: [],
            lines: ['+fs.rmSync(targetDir, { recursive: true });'],
          },
        ],
      },
    };

    const findings = evaluateRiskFindings([file]);
    const destrFinding = findings.find((f) => f.ruleId === 'DESTRUCTIVE_OPERATION');
    expect(destrFinding).toBeDefined();
    expect(destrFinding?.severity).toBe('high');
  });

  it('flags package manifest changes', () => {
    const file: ChangedFile = {
      path: 'package.json',
      kind: 'other',
      matchedPatterns: [],
      isStaged: true,
      isUnstaged: false,
      isUntracked: false,
      isDeleted: false,
      isRenamed: false,
    };

    const findings = evaluateRiskFindings([file]);
    const manifestFinding = findings.find((f) => f.ruleId === 'PACKAGE_MANIFEST');
    expect(manifestFinding).toBeDefined();
    expect(manifestFinding?.severity).toBe('medium');
  });
});
