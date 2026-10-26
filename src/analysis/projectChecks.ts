import * as fs from 'fs';
import * as path from 'path';
import { ProjectCheck } from '../models/scanResult';

/**
 * Discovers available project validation checks safely by inspecting workspace metadata.
 *
 * CRITICAL SAFETY RULES:
 * 1. Never executes arbitrary commands automatically or silently.
 * 2. Checks are discovered and presented in an 'idle' state.
 * 3. Execution requires explicit developer invocation with consent.
 *
 * @param workspaceRoot - Absolute path to workspace root.
 */
export async function discoverProjectChecks(workspaceRoot: string): Promise<ProjectCheck[]> {
  const checks: ProjectCheck[] = [];
  const pkgPath = path.join(workspaceRoot, 'package.json');

  let pkgContent = '';
  try {
    pkgContent = await fs.promises.readFile(pkgPath, 'utf8');
  } catch {
    // Non-npm project or missing package.json
    return checks;
  }

  let pkg: { scripts?: Record<string, string> };
  try {
    pkg = JSON.parse(pkgContent);
  } catch {
    return checks;
  }

  const scripts = pkg.scripts || {};

  // 1. Typecheck
  if (scripts['typecheck']) {
    checks.push({
      id: 'check_typecheck',
      name: 'TypeScript Compilation (typecheck)',
      type: 'typecheck',
      command: 'npm run typecheck',
      isAvailable: true,
      status: 'idle',
    });
  } else if (scripts['check']) {
    checks.push({
      id: 'check_typecheck',
      name: 'Type Check (check)',
      type: 'typecheck',
      command: 'npm run check',
      isAvailable: true,
      status: 'idle',
    });
  }

  // 2. Lint
  if (scripts['lint']) {
    checks.push({
      id: 'check_lint',
      name: 'Linter (lint)',
      type: 'lint',
      command: 'npm run lint',
      isAvailable: true,
      status: 'idle',
    });
  }

  // 3. Test
  if (scripts['test']) {
    checks.push({
      id: 'check_test',
      name: 'Automated Tests (test)',
      type: 'test',
      command: 'npm run test',
      isAvailable: true,
      status: 'idle',
    });
  }

  // 4. Build / Compile
  if (scripts['compile']) {
    checks.push({
      id: 'check_build',
      name: 'Compile (compile)',
      type: 'build',
      command: 'npm run compile',
      isAvailable: true,
      status: 'idle',
    });
  } else if (scripts['build']) {
    checks.push({
      id: 'check_build',
      name: 'Build (build)',
      type: 'build',
      command: 'npm run build',
      isAvailable: true,
      status: 'idle',
    });
  }

  return checks;
}
