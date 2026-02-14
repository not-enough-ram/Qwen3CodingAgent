export type CategorizedPackages = {
  production: string[]
  dev: string[]
}

export type PackageEntry = {
  name: string
  files: string[]
}

const TEST_PATTERNS = [
  /\.test\.(ts|js|tsx|jsx|mts|cts|mjs|cjs)$/,
  /\.spec\.(ts|js|tsx|jsx|mts|cts|mjs|cjs)$/,
  /\/__tests__\//,
  /\/test\//,
  /\/tests\//,
  /\/spec\//,
  /\/specs\//,
  /-test\.(ts|js|tsx|jsx)$/,
  /-spec\.(ts|js|tsx|jsx)$/,
  // Top-level test/tests/spec directories
  /^test\//,
  /^tests\//,
  /^spec\//,
  /^__tests__\//,
]

const KNOWN_DEV_PACKAGES = new Set([
  'vitest', 'jest', 'mocha', 'chai', 'jasmine',
  'eslint', 'prettier', 'husky', 'lint-staged',
  'typescript', 'ts-node', 'ts-jest',
  'webpack', 'vite', 'rollup', 'esbuild',
  'nodemon', 'concurrently',
])

/**
 * Determines if a file path represents a test file.
 */
export function isTestFile(filePath: string): boolean {
  return TEST_PATTERNS.some((pattern) => pattern.test(filePath))
}

/**
 * Categorizes a package as 'dev' or 'prod' based on its name and importing files.
 *
 * Priority:
 * 1. @types/* → always dev
 * 2. Known dev packages (vitest, jest, eslint, etc.) → always dev
 * 3. All importing files are test files → dev
 * 4. Any non-test importing file → prod
 * 5. Default (no file context) → prod
 */
export function categorizePackage(
  packageName: string,
  importingFilePaths: string[]
): 'dev' | 'prod' {
  // @types/* always dev
  if (packageName.startsWith('@types/')) {
    return 'dev'
  }

  // Known dev-only packages always dev
  if (KNOWN_DEV_PACKAGES.has(packageName)) {
    return 'dev'
  }

  // No file context → default to prod
  if (importingFilePaths.length === 0) {
    return 'prod'
  }

  // If ANY file is non-test → prod
  const hasNonTestFile = importingFilePaths.some((f) => !isTestFile(f))
  return hasNonTestFile ? 'prod' : 'dev'
}

/**
 * Categorizes multiple packages into production and dev groups.
 */
export function categorizePackages(entries: PackageEntry[]): CategorizedPackages {
  const production: string[] = []
  const dev: string[] = []

  for (const entry of entries) {
    const category = categorizePackage(entry.name, entry.files)
    if (category === 'dev') {
      dev.push(entry.name)
    } else {
      production.push(entry.name)
    }
  }

  return { production, dev }
}
