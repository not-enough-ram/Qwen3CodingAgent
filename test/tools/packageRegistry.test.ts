import { describe, expect, it } from 'vitest';
import {
  validatePackageName,
  validatePackageExists,
  validatePackagesBatch
} from '../../src/tools/packageRegistry.js';

describe('validatePackageName', () => {
  it('returns valid for simple package name', () => {
    const result = validatePackageName('zod');
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('returns valid for scoped package', () => {
    const result = validatePackageName('@types/node');
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('returns invalid for empty string', () => {
    const result = validatePackageName('');
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('returns invalid for package starting with dot', () => {
    const result = validatePackageName('.invalid');
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('returns valid for uppercase package name (legacy packages)', () => {
    // Uppercase is valid for old packages in npm registry
    const result = validatePackageName('UPPERCASE');
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });
});

describe('validatePackageExists - integration', () => {
  it('returns exists true for real package', { timeout: 10000 }, async () => {
    const result = await validatePackageExists('zod');
    expect(result.exists).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('returns exists false for non-existent package', { timeout: 10000 }, async () => {
    const result = await validatePackageExists('zzz-definitely-not-a-real-package-xyz-12345');
    expect(result.exists).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error).toContain('not found');
  });

  it('returns exists false for invalid package name without HTTP request', async () => {
    const result = await validatePackageExists('.invalid-name');
    expect(result.exists).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe('validatePackagesBatch', () => {
  it('returns results for multiple packages', { timeout: 10000 }, async () => {
    const results = await validatePackagesBatch(['zod', 'zzz-fake-package-xyz-12345']);

    expect(results.size).toBe(2);

    const zodResult = results.get('zod');
    expect(zodResult?.exists).toBe(true);

    const fakeResult = results.get('zzz-fake-package-xyz-12345');
    expect(fakeResult?.exists).toBe(false);
  });

  it('validates invalid packages without blocking valid ones', { timeout: 10000 }, async () => {
    const results = await validatePackagesBatch(['.invalid', 'zod']);

    expect(results.size).toBe(2);

    const invalidResult = results.get('.invalid');
    expect(invalidResult?.exists).toBe(false);
    expect(invalidResult?.error).toBeDefined();

    const validResult = results.get('zod');
    expect(validResult?.exists).toBe(true);
  });
});
