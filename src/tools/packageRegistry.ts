import https from 'node:https';
import validate from 'validate-npm-package-name';

export type RegistryValidationResult = {
  exists: boolean;
  error?: string;
};

export type PackageNameValidation = {
  valid: boolean;
  error?: string;
};

/**
 * Validates package name format using npm's official validation library.
 * This prevents invalid HTTP requests to the registry.
 */
export function validatePackageName(packageName: string): PackageNameValidation {
  const result = validate(packageName);

  if (result.validForNewPackages || result.validForOldPackages) {
    return { valid: true };
  }

  const error = result.errors?.[0] || result.warnings?.[0] || 'Invalid package name';
  return { valid: false, error };
}

/**
 * Checks if a package exists on the npm registry.
 * Makes an HTTP GET request to registry.npmjs.org with a 5-second timeout.
 */
export function validatePackageExists(packageName: string): Promise<RegistryValidationResult> {
  return new Promise((resolve) => {
    // First validate the package name format
    const nameValidation = validatePackageName(packageName);
    if (!nameValidation.valid) {
      resolve({ exists: false, error: nameValidation.error || 'Invalid package name' });
      return;
    }

    const url = `https://registry.npmjs.org/${encodeURIComponent(packageName)}`;

    const options = {
      headers: {
        'Accept': 'application/vnd.npm.install-v1+json', // Abbreviated metadata
        'User-Agent': 'qwen-coding-agent'
      },
      timeout: 5000 // 5 second timeout
    };

    const req = https.get(url, options, (res) => {
      // Drain the response body (we only need status code)
      res.resume();

      if (res.statusCode === 200) {
        resolve({ exists: true });
      } else if (res.statusCode === 404) {
        resolve({
          exists: false,
          error: `Package "${packageName}" not found on npm registry`
        });
      } else {
        resolve({
          exists: false,
          error: `Registry error: HTTP ${res.statusCode}`
        });
      }
    });

    req.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
        resolve({
          exists: false,
          error: 'Registry request timeout (5s)'
        });
      } else {
        resolve({
          exists: false,
          error: `Network error: ${error.message}`
        });
      }
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        exists: false,
        error: 'Registry request timeout (5s)'
      });
    });
  });
}

/**
 * Validates multiple packages in parallel.
 * Returns a Map of package name to validation result.
 */
export async function validatePackagesBatch(
  packageNames: string[]
): Promise<Map<string, RegistryValidationResult>> {
  const results = await Promise.all(
    packageNames.map(async (name) => {
      const result = await validatePackageExists(name);
      return [name, result] as const;
    })
  );

  return new Map(results);
}
