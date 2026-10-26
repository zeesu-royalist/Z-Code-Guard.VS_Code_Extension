import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  validateConfig,
  CONFIG_FILE_NAME,
  STARTER_CONFIG,
} from '../../src/config/configSchema';
import {
  readWorkspaceConfig,
  createStarterConfig,
} from '../../src/config/configReader';

describe('Configuration Schema & Validator (validateConfig)', () => {
  it('accepts a valid configuration with protected and exclude paths', () => {
    const input = {
      version: 1,
      protectedPaths: ['src/auth/**', 'src/services/**'],
      excludePaths: ['node_modules/**', 'dist/**'],
    };

    const result = validateConfig(input);
    expect(result.isValid).toBe(true);
    if (result.isValid) {
      expect(result.config.version).toBe(1);
      expect(result.config.protectedPaths).toEqual(['src/auth/**', 'src/services/**']);
      expect(result.config.excludePaths).toEqual(['node_modules/**', 'dist/**']);
    }
  });

  it('accepts a valid configuration with optional excludePaths omitted', () => {
    const input = {
      version: 1,
      protectedPaths: ['src/payment/**'],
    };

    const result = validateConfig(input);
    expect(result.isValid).toBe(true);
    if (result.isValid) {
      expect(result.config.protectedPaths).toEqual(['src/payment/**']);
      expect(result.config.excludePaths).toBeUndefined();
    }
  });

  it('rejects non-object inputs', () => {
    expect(validateConfig(null).isValid).toBe(false);
    expect(validateConfig(undefined).isValid).toBe(false);
    expect(validateConfig('string').isValid).toBe(false);
    expect(validateConfig(123).isValid).toBe(false);
    expect(validateConfig([]).isValid).toBe(false);
  });

  it('rejects missing or invalid version property', () => {
    // Missing version
    const missingVer = validateConfig({ protectedPaths: ['src/**'] });
    expect(missingVer.isValid).toBe(false);
    if (!missingVer.isValid) {
      expect(missingVer.error).toContain("Missing required property 'version'");
    }

    // Non-number version
    const stringVer = validateConfig({ version: '1', protectedPaths: ['src/**'] });
    expect(stringVer.isValid).toBe(false);
    if (!stringVer.isValid) {
      expect(stringVer.error).toContain("Property 'version' must be an integer");
    }

    // Unsupported version number
    const wrongVer = validateConfig({ version: 2, protectedPaths: ['src/**'] });
    expect(wrongVer.isValid).toBe(false);
    if (!wrongVer.isValid) {
      expect(wrongVer.error).toContain('Unsupported configuration version');
    }
  });

  it('rejects missing, non-array, or empty protectedPaths', () => {
    // Missing protectedPaths
    const missing = validateConfig({ version: 1 });
    expect(missing.isValid).toBe(false);
    if (!missing.isValid) {
      expect(missing.error).toContain("Missing required property 'protectedPaths'");
    }

    // Non-array
    const notArray = validateConfig({ version: 1, protectedPaths: 'src/**' });
    expect(notArray.isValid).toBe(false);
    if (!notArray.isValid) {
      expect(notArray.error).toContain("Property 'protectedPaths' must be an array");
    }

    // Empty array
    const emptyArray = validateConfig({ version: 1, protectedPaths: [] });
    expect(emptyArray.isValid).toBe(false);
    if (!emptyArray.isValid) {
      expect(emptyArray.error).toContain("'protectedPaths' must contain at least one pattern");
    }
  });

  it('rejects invalid or empty string patterns in protectedPaths', () => {
    // Non-string item
    const withNumber = validateConfig({ version: 1, protectedPaths: ['src/**', 123] });
    expect(withNumber.isValid).toBe(false);
    if (!withNumber.isValid) {
      expect(withNumber.error).toContain("Invalid pattern in 'protectedPaths' at index 1");
    }

    // Empty string item
    const withEmpty = validateConfig({ version: 1, protectedPaths: ['src/**', ''] });
    expect(withEmpty.isValid).toBe(false);
    if (!withEmpty.isValid) {
      expect(withEmpty.error).toContain("Invalid pattern in 'protectedPaths' at index 1");
    }

    // Whitespace only item
    const withWhitespace = validateConfig({ version: 1, protectedPaths: ['   '] });
    expect(withWhitespace.isValid).toBe(false);
    if (!withWhitespace.isValid) {
      expect(withWhitespace.error).toContain("Invalid pattern in 'protectedPaths' at index 0");
    }
  });

  it('rejects invalid excludePaths formats', () => {
    // Non-array excludePaths
    const nonArray = validateConfig({
      version: 1,
      protectedPaths: ['src/**'],
      excludePaths: 'dist/**',
    });
    expect(nonArray.isValid).toBe(false);
    if (!nonArray.isValid) {
      expect(nonArray.error).toContain("Property 'excludePaths' must be an array");
    }

    // Empty string in excludePaths
    const emptyExclude = validateConfig({
      version: 1,
      protectedPaths: ['src/**'],
      excludePaths: [''],
    });
    expect(emptyExclude.isValid).toBe(false);
    if (!emptyExclude.isValid) {
      expect(emptyExclude.error).toContain("Invalid pattern in 'excludePaths' at index 0");
    }
  });
});

describe('Configuration Reader & Generator (readWorkspaceConfig & createStarterConfig)', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'z-code-guard-test-'));
  });

  afterEach(async () => {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  });

  it('reports missing status when .z-code-guard.json is not present', async () => {
    const result = await readWorkspaceConfig(tempDir);
    expect(result.status).toBe('missing');
    if (result.status === 'missing') {
      expect(result.configPath).toBe(path.join(tempDir, CONFIG_FILE_NAME));
      expect(result.message).toContain('was not found');
    }
  });

  it('reports malformed status when configuration file has invalid JSON syntax', async () => {
    const configPath = path.join(tempDir, CONFIG_FILE_NAME);
    await fs.promises.writeFile(configPath, '{ version: 1, unclosed: ', 'utf8');

    const result = await readWorkspaceConfig(tempDir);
    expect(result.status).toBe('malformed');
    if (result.status === 'malformed') {
      expect(result.rawError).toBeDefined();
      expect(result.message).toContain('invalid JSON');
    }
  });

  it('reports invalid status when configuration file violates schema', async () => {
    const configPath = path.join(tempDir, CONFIG_FILE_NAME);
    await fs.promises.writeFile(
      configPath,
      JSON.stringify({ version: 99, protectedPaths: [] }),
      'utf8'
    );

    const result = await readWorkspaceConfig(tempDir);
    expect(result.status).toBe('invalid');
    if (result.status === 'invalid') {
      expect(result.validationError).toBeDefined();
      expect(result.message).toContain('is invalid');
    }
  });

  it('successfully reads and parses a valid configuration file', async () => {
    const configPath = path.join(tempDir, CONFIG_FILE_NAME);
    const validData = {
      version: 1,
      protectedPaths: ['src/auth/**', 'src/services/**'],
      excludePaths: ['node_modules/**'],
    };
    await fs.promises.writeFile(configPath, JSON.stringify(validData), 'utf8');

    const result = await readWorkspaceConfig(tempDir);
    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.config.version).toBe(1);
      expect(result.config.protectedPaths).toEqual(['src/auth/**', 'src/services/**']);
      expect(result.config.excludePaths).toEqual(['node_modules/**']);
    }
  });

  it('creates a starter configuration file when one does not exist', async () => {
    const result = await createStarterConfig(tempDir);
    expect(result.created).toBe(true);

    const createdContent = await fs.promises.readFile(result.configPath, 'utf8');
    const parsed = JSON.parse(createdContent);
    expect(parsed.version).toBe(STARTER_CONFIG.version);
    expect(parsed.protectedPaths).toEqual(STARTER_CONFIG.protectedPaths);
    expect(parsed.excludePaths).toEqual(STARTER_CONFIG.excludePaths);
  });

  it('NEVER overwrites an existing configuration file', async () => {
    const configPath = path.join(tempDir, CONFIG_FILE_NAME);
    const customContent = JSON.stringify({
      version: 1,
      protectedPaths: ['my/custom/path/**'],
    });
    await fs.promises.writeFile(configPath, customContent, 'utf8');

    // Attempt to create starter config over existing file
    const result = await createStarterConfig(tempDir);
    expect(result.created).toBe(false);
    expect(result.reason).toContain('already exists');

    // Verify existing file content remains untouched
    const existingContent = await fs.promises.readFile(configPath, 'utf8');
    expect(existingContent).toBe(customContent);
    const parsed = JSON.parse(existingContent);
    expect(parsed.protectedPaths).toEqual(['my/custom/path/**']);
  });
});
