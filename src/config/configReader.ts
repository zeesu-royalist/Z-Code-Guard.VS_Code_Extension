import * as fs from 'fs';
import * as path from 'path';
import {
  CONFIG_FILE_NAME,
  STARTER_CONFIG_CONTENT,
  validateConfig,
  ZCodeGuardConfig,
} from './configSchema';

/**
 * Result representing a successful configuration load.
 */
export interface ConfigReadSuccess {
  status: 'success';
  config: ZCodeGuardConfig;
  configPath: string;
}

/**
 * Result returned when the configuration file does not exist in the workspace.
 */
export interface ConfigReadMissing {
  status: 'missing';
  message: string;
  configPath: string;
}

/**
 * Result returned when the configuration file contains invalid/unparseable JSON.
 */
export interface ConfigReadMalformed {
  status: 'malformed';
  message: string;
  configPath: string;
  rawError: string;
}

/**
 * Result returned when the JSON is syntactically valid but fails schema validation.
 */
export interface ConfigReadInvalid {
  status: 'invalid';
  message: string;
  configPath: string;
  validationError: string;
}

export type ConfigReadResult =
  | ConfigReadSuccess
  | ConfigReadMissing
  | ConfigReadMalformed
  | ConfigReadInvalid;

/**
 * Result returned after attempting to create a starter configuration file.
 */
export interface CreateStarterResult {
  created: boolean;
  configPath: string;
  reason?: string;
}

/**
 * Reads and validates `.z-code-guard.json` from the specified workspace directory.
 *
 * This function is local-first, safe, and does not throw on expected errors
 * (such as missing or malformed files). It returns a discriminated union result.
 *
 * @param workspaceRoot - Absolute path to the workspace root directory.
 */
export async function readWorkspaceConfig(workspaceRoot: string): Promise<ConfigReadResult> {
  const configPath = path.join(workspaceRoot, CONFIG_FILE_NAME);

  let rawContent: string;
  try {
    rawContent = await fs.promises.readFile(configPath, 'utf8');
  } catch (error: unknown) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === 'ENOENT') {
      return {
        status: 'missing',
        message: `Configuration file '${CONFIG_FILE_NAME}' was not found in '${workspaceRoot}'.`,
        configPath,
      };
    }

    return {
      status: 'malformed',
      message: `Failed to read configuration file at '${configPath}': ${nodeError.message}`,
      configPath,
      rawError: nodeError.message,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawContent);
  } catch (error: unknown) {
    const parseError = error as SyntaxError;
    return {
      status: 'malformed',
      message: `Configuration file '${CONFIG_FILE_NAME}' contains invalid JSON: ${parseError.message}`,
      configPath,
      rawError: parseError.message,
    };
  }

  const validation = validateConfig(parsed);
  if (!validation.isValid) {
    const failure = validation as import('./configSchema').ValidationFailure;
    return {
      status: 'invalid',
      message: `Configuration file '${CONFIG_FILE_NAME}' is invalid: ${failure.error}`,
      configPath,
      validationError: failure.error,
    };
  }

  return {
    status: 'success',
    config: validation.config,
    configPath,
  };
}

/**
 * Creates a starter `.z-code-guard.json` file in the given workspace root.
 *
 * CRITICAL SAFETY RULE: This function NEVER overwrites an existing file.
 * Uses the exclusive creation flag ('wx') to atomically ensure existing content is preserved.
 *
 * @param workspaceRoot - Absolute path to the workspace root directory.
 */
export async function createStarterConfig(workspaceRoot: string): Promise<CreateStarterResult> {
  const configPath = path.join(workspaceRoot, CONFIG_FILE_NAME);

  try {
    // 'wx' flag opens the file for writing only if it does not already exist
    await fs.promises.writeFile(configPath, STARTER_CONFIG_CONTENT, { flag: 'wx', encoding: 'utf8' });
    return {
      created: true,
      configPath,
    };
  } catch (error: unknown) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === 'EEXIST') {
      return {
        created: false,
        configPath,
        reason: `Configuration file '${CONFIG_FILE_NAME}' already exists. Existing file was not modified.`,
      };
    }

    return {
      created: false,
      configPath,
      reason: `Could not create configuration file: ${nodeError.message}`,
    };
  }
}
