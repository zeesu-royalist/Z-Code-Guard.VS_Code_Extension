/**
 * Configuration schema and validation rules for Z-Code-Guard.
 *
 * The configuration file is stored in the workspace root as `.z-code-guard.json`.
 * It defines which directories and files are protected from unintentional changes,
 * and which paths should be excluded from scans.
 */

export const CONFIG_FILE_NAME = '.z-code-guard.json';
export const CURRENT_CONFIG_VERSION = 1;

/**
 * The typed structure of a valid Z-Code-Guard configuration file.
 */
export interface ZCodeGuardConfig {
  /**
   * Configuration schema version. Currently only version 1 is supported.
   */
  version: number;

  /**
   * Array of glob-style patterns or relative paths marked as protected.
   * Example: ["src/auth/**", "src/services/**"]
   */
  protectedPaths: string[];

  /**
   * Array of glob-style patterns or relative paths excluded from scans.
   * Example: ["node_modules/**", "dist/**"]
   */
  excludePaths?: string[];
}

/**
 * Result returned when configuration validation succeeds.
 */
export interface ValidationSuccess {
  isValid: true;
  config: ZCodeGuardConfig;
}

/**
 * Result returned when configuration validation fails.
 */
export interface ValidationFailure {
  isValid: false;
  error: string;
}

export type ValidationResult = ValidationSuccess | ValidationFailure;

/**
 * Starter configuration template provided when a user creates a new .z-code-guard.json.
 */
export const STARTER_CONFIG: ZCodeGuardConfig = {
  version: CURRENT_CONFIG_VERSION,
  protectedPaths: [
    'src/auth/**',
    'src/services/**',
    'src/business-logic/**',
  ],
  excludePaths: [
    'node_modules/**',
    'dist/**',
    'coverage/**',
  ],
};

export const STARTER_CONFIG_CONTENT = JSON.stringify(STARTER_CONFIG, null, 2) + '\n';

/**
 * Validates unknown parsed JSON data against the ZCodeGuardConfig schema.
 *
 * Returns a typed ValidationResult with a user-friendly error message if validation fails.
 *
 * @param data - The parsed JSON data to validate.
 */
export function validateConfig(data: unknown): ValidationResult {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return {
      isValid: false,
      error: 'Configuration must be a JSON object.',
    };
  }

  const record = data as Record<string, unknown>;

  // 1. Validate 'version'
  if (record.version === undefined) {
    return {
      isValid: false,
      error: "Missing required property 'version'.",
    };
  }

  if (typeof record.version !== 'number' || !Number.isInteger(record.version)) {
    return {
      isValid: false,
      error: "Property 'version' must be an integer.",
    };
  }

  if (record.version !== CURRENT_CONFIG_VERSION) {
    return {
      isValid: false,
      error: `Unsupported configuration version: ${record.version}. Only version ${CURRENT_CONFIG_VERSION} is supported.`,
    };
  }

  // 2. Validate 'protectedPaths'
  if (record.protectedPaths === undefined) {
    return {
      isValid: false,
      error: "Missing required property 'protectedPaths'.",
    };
  }

  if (!Array.isArray(record.protectedPaths)) {
    return {
      isValid: false,
      error: "Property 'protectedPaths' must be an array of pattern strings.",
    };
  }

  if (record.protectedPaths.length === 0) {
    return {
      isValid: false,
      error: "'protectedPaths' must contain at least one pattern.",
    };
  }

  for (let i = 0; i < record.protectedPaths.length; i++) {
    const item = record.protectedPaths[i];
    if (typeof item !== 'string' || item.trim().length === 0) {
      return {
        isValid: false,
        error: `Invalid pattern in 'protectedPaths' at index ${i}: pattern must be a non-empty string.`,
      };
    }
  }

  // 3. Validate 'excludePaths' (optional)
  let cleanExcludePaths: string[] | undefined = undefined;

  if (record.excludePaths !== undefined) {
    if (!Array.isArray(record.excludePaths)) {
      return {
        isValid: false,
        error: "Property 'excludePaths' must be an array of pattern strings.",
      };
    }

    for (let i = 0; i < record.excludePaths.length; i++) {
      const item = record.excludePaths[i];
      if (typeof item !== 'string' || item.trim().length === 0) {
        return {
          isValid: false,
          error: `Invalid pattern in 'excludePaths' at index ${i}: pattern must be a non-empty string.`,
        };
      }
    }

    cleanExcludePaths = record.excludePaths.map((p) => p.trim());
  }

  const validatedConfig: ZCodeGuardConfig = {
    version: record.version,
    protectedPaths: record.protectedPaths.map((p) => (p as string).trim()),
    ...(cleanExcludePaths ? { excludePaths: cleanExcludePaths } : {}),
  };

  return {
    isValid: true,
    config: validatedConfig,
  };
}
