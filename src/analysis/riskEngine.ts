import { ChangedFile, RiskFinding } from '../models/scanResult';

/**
 * Mask sensitive credentials or tokens in evidence strings to avoid exposing secrets.
 */
export function redactSecretValue(evidence: string): string {
  if (!evidence) {
    return '';
  }

  // Redact assignment patterns: KEY="secret_val" or KEY: 'secret_val'
  return evidence.replace(
    /(['"]?(?:api[_-]?key|secret|token|password|auth|bearer)['"]?\s*[:=]\s*['"])([^'"]+)(['"])/gi,
    (_match, prefix, secret, suffix) => {
      if (secret.length <= 4) {
        return `${prefix}****${suffix}`;
      }
      const visible = secret.slice(0, 2);
      return `${prefix}${visible}****${suffix}`;
    }
  );
}

/**
 * Analyzes changed files, their diff lines, and symbols against evidence-based risk rules.
 *
 * @param changedFiles - List of changed files with hunks and symbols.
 * @returns Array of detected RiskFindings.
 */
export function evaluateRiskFindings(changedFiles: ChangedFile[]): RiskFinding[] {
  const allFindings: RiskFinding[] = [];

  for (const file of changedFiles) {
    const fileFindings: RiskFinding[] = [];
    const hunks = file.diff?.hunks || [];

    // Extract added and modified lines for evidence scanning
    const addedLines: { lineNum: number; text: string }[] = [];
    for (const hunk of hunks) {
      let currentLine = hunk.newStart;
      for (const rawLine of hunk.lines) {
        if (rawLine.startsWith('+') && !rawLine.startsWith('+++')) {
          addedLines.push({ lineNum: currentLine, text: rawLine.slice(1).trim() });
          currentLine++;
        } else if (rawLine.startsWith(' ')) {
          currentLine++;
        }
      }
    }

    // 1. RULE: PROTECTED_BOUNDARY
    if (file.kind === 'protected') {
      fileFindings.push({
        id: `protected_${file.path}`,
        ruleId: 'PROTECTED_BOUNDARY',
        severity: 'needs_review',
        category: 'protected_boundary',
        title: 'Protected Boundary Modified',
        message: `File matches configured protection rules: ${file.matchedPatterns.join(', ')}`,
        filePath: file.path,
        evidence: `Matched protection pattern(s): ${file.matchedPatterns.join(', ')}`,
        suggestedVerification:
          'Review diff thoroughly and verify changes adhere to architectural boundary constraints.',
        confidence: 'confirmed',
      });
    }

    // 2. RULE: PACKAGE_MANIFEST
    if (
      file.path === 'package.json' ||
      file.path === 'package-lock.json' ||
      file.path.endsWith('/package.json')
    ) {
      fileFindings.push({
        id: `manifest_${file.path}`,
        ruleId: 'PACKAGE_MANIFEST',
        severity: 'medium',
        category: 'package_manifest',
        title: 'Project Dependencies Modified',
        message: 'Changes detected in package manifest or dependency lockfile.',
        filePath: file.path,
        evidence: `Modified package manifest: ${file.path}`,
        suggestedVerification:
          'Verify added dependencies are trusted, check for vulnerability advisories, and test build.',
        confidence: 'confirmed',
      });
    }

    // 3. Scan added/modified lines for code-level risk patterns
    for (const item of addedLines) {
      const { lineNum, text } = item;

      // RULE: AUTH_CHANGE (e.g. jwt, passport, bcrypt, session, password)
      if (
        /\b(jwt\.sign|jwt\.verify|bcrypt|argon2|passport\.authenticate|setSession|destroySession|hashPassword)\b/i.test(
          text
        )
      ) {
        fileFindings.push({
          id: `auth_${file.path}_${lineNum}`,
          ruleId: 'AUTH_CHANGE',
          severity: 'high',
          category: 'auth_or_security',
          title: 'Authentication / Token Logic Altered',
          message: 'Changes found in authentication, token generation, or password handling code.',
          filePath: file.path,
          lineRange: { start: lineNum, end: lineNum },
          evidence: redactSecretValue(text),
          suggestedVerification:
            'Test login, session expiration, token revocation, and invalid credential handling.',
          confidence: 'confirmed',
        });
      }

      // RULE: PERMISSION_CHECK (e.g. role check, permissions, access control)
      if (
        /\b(hasPermission|checkPermission|isAdmin|requireRole|isAuthorized|allowAccess|denyAccess)\b/i.test(
          text
        ) ||
        /\brole\s*(?:===|!==|==|!=)\s*['"][a-zA-Z0-9_-]+['"]/i.test(text)
      ) {
        fileFindings.push({
          id: `perm_${file.path}_${lineNum}`,
          ruleId: 'PERMISSION_CHECK',
          severity: 'high',
          category: 'permission_access',
          title: 'Access Control / Permission Condition Changed',
          message: 'Authorization checks or user role comparisons modified.',
          filePath: file.path,
          lineRange: { start: lineNum, end: lineNum },
          evidence: redactSecretValue(text),
          suggestedVerification:
            'Verify both authorized and unauthorized user access roles with regression test cases.',
          confidence: 'confirmed',
        });
      }

      // RULE: PAYMENT_TRANSACTION (e.g. Stripe, PayPal, charge, refund)
      if (
        /\b(stripe\.(?:charges|paymentIntents|refunds|subscriptions)|paypal|chargeCreditCard|processPayment)\b/i.test(
          text
        )
      ) {
        fileFindings.push({
          id: `payment_${file.path}_${lineNum}`,
          ruleId: 'PAYMENT_TRANSACTION',
          severity: 'high',
          category: 'auth_or_security',
          title: 'Payment / Transaction Execution Changed',
          message: 'Code initiating financial transactions or payment gateway calls altered.',
          filePath: file.path,
          lineRange: { start: lineNum, end: lineNum },
          evidence: redactSecretValue(text),
          suggestedVerification:
            'Run sandbox payment tests; check idempotency keys and error handling for failed payments.',
          confidence: 'confirmed',
        });
      }

      // RULE: SECRETS_OR_ENV (e.g. process.env, hardcoded credentials)
      if (
        /\b(process\.env\.[A-Z0-9_]+)\b/.test(text) ||
        /(?:api_key|secret_key|private_key)\s*[:=]\s*['"][a-zA-Z0-9_=-]{10,}['"]/i.test(text)
      ) {
        fileFindings.push({
          id: `secret_${file.path}_${lineNum}`,
          ruleId: 'SECRETS_OR_ENV',
          severity: 'medium',
          category: 'secrets_or_env',
          title: 'Environment Variable or Credential Access',
          message: 'Environment variable usage or credential pattern identified in modified lines.',
          filePath: file.path,
          lineRange: { start: lineNum, end: lineNum },
          evidence: redactSecretValue(text),
          suggestedVerification:
            'Confirm secrets are not committed into source control and fallback values are secure.',
          confidence: 'heuristic',
        });
      }

      // RULE: DESTRUCTIVE_OPERATION (e.g. DROP TABLE, rmSync, exec, eval)
      if (
        /\b(DROP\s+TABLE|TRUNCATE\s+TABLE|rmSync|unlinkSync|rmdirSync|eval\(|new\s+Function\()\b/i.test(
          text
        )
      ) {
        fileFindings.push({
          id: `destructive_${file.path}_${lineNum}`,
          ruleId: 'DESTRUCTIVE_OPERATION',
          severity: 'high',
          category: 'destructive_pattern',
          title: 'Destructive Operation Detected',
          message: 'Destructive filesystem or database deletion pattern found in changed code.',
          filePath: file.path,
          lineRange: { start: lineNum, end: lineNum },
          evidence: redactSecretValue(text),
          suggestedVerification:
            'Confirm data loss protections, backup mechanisms, and confirmation guards are present.',
          confidence: 'confirmed',
        });
      }
    }

    // 4. RULE: EXPORTED_SIGNATURE (Exported functions/classes altered)
    const exportedSymbols = (file.symbols || []).filter((s) => s.isExported);
    if (exportedSymbols.length > 0) {
      const names = exportedSymbols.map((s) => s.name).join(', ');
      fileFindings.push({
        id: `export_${file.path}`,
        ruleId: 'EXPORTED_SIGNATURE',
        severity: 'medium',
        category: 'breaking_api',
        title: 'Exported Symbol / Public API Modified',
        message: `Exported declaration(s) changed: ${names}`,
        filePath: file.path,
        evidence: `Modified exported symbol(s): ${names}`,
        suggestedVerification:
          'Review callers and dependents to prevent breaking downstream consumers or module contracts.',
        confidence: 'confirmed',
      });
    }

    // 5. RULE: NEW_ERROR (New diagnostic introduced on changed file)
    const newDiagnostics = (file.diagnostics || []).filter((d) => d.baselineStatus === 'new');
    if (newDiagnostics.length > 0) {
      const firstDiag = newDiagnostics[0];
      fileFindings.push({
        id: `diag_${file.path}_${firstDiag.startLine}`,
        ruleId: 'NEW_DIAGNOSTIC',
        severity: firstDiag.severity === 'error' ? 'high' : 'medium',
        category: 'new_error',
        title: `New ${firstDiag.severity.toUpperCase()} Introduced`,
        message: firstDiag.message,
        filePath: file.path,
        lineRange: { start: firstDiag.startLine, end: firstDiag.endLine },
        evidence: `Line ${firstDiag.startLine}: ${firstDiag.message}`,
        suggestedVerification:
          'Address compiler/linter error before committing or proceeding with further changes.',
        confidence: 'confirmed',
      });
    }

    file.risks = fileFindings;
    allFindings.push(...fileFindings);
  }

  return allFindings;
}
