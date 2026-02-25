#!/usr/bin/env node
// @ts-check
//
// Checks that all non-private packages in `packages/` exist on npm. This is
// needed because trusted publishing can only update existing packages, not
// create new ones.
//
// Uses the npm registry API directly instead of `npm view` to avoid spawning
// a separate process per package. This enables HTTP connection reuse and
// avoids rate limiting that occurs with many sequential `npm view` calls.

import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const PACKAGES_DIR = 'packages';
const REGISTRY_URL = 'https://registry.npmjs.org';
const MAX_RETRIES = 3;

/**
 * Check if a package exists on npm by querying the registry API directly.
 * Retries on transient errors (429, 5xx) with exponential backoff.
 * @param {string} packageName
 * @returns {Promise<boolean>}
 */
async function packageExistsOnNpm(packageName) {
  const url = `${REGISTRY_URL}/${packageName}/latest`;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = 1000 * 2 ** (attempt - 1);
      console.log(
        `  Retrying ${packageName} in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES + 1})...`,
      );
      await sleep(delay);
    }

    const response = await fetch(url);

    if (response.ok) {
      return true;
    }

    if (response.status === 404) {
      return false;
    }

    // Retry on rate limiting or server errors.
    if (response.status === 429 || response.status >= 500) {
      if (attempt === MAX_RETRIES) {
        throw new Error(
          `Failed to check ${packageName} after ${MAX_RETRIES + 1} attempts: HTTP ${response.status}`,
        );
      }
      continue;
    }

    throw new Error(`Unexpected response for ${packageName}: HTTP ${response.status}`);
  }

  // Should be unreachable, but satisfy TypeScript.
  return false;
}

/**
 * Read and parse a package.json file.
 * @param {string} packagePath
 * @returns {Promise<{ name: string; private?: boolean } | null>}
 */
async function readPackageJson(packagePath) {
  try {
    const content = await readFile(join(packagePath, 'package.json'), 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

const packageDirs = await readdir(PACKAGES_DIR, { withFileTypes: true });
const packages = packageDirs.filter((entry) => entry.isDirectory());

/** @type {{ name: string; path: string }[]} */
const missingPackages = [];

console.log('Checking that all non-private packages exist on npm...\n');

for (const pkg of packages) {
  const packagePath = join(PACKAGES_DIR, pkg.name);
  const packageJson = await readPackageJson(packagePath);

  if (!packageJson || packageJson.private) {
    continue;
  }

  const exists = await packageExistsOnNpm(packageJson.name);
  console.log(`${packageJson.name}: ${exists ? 'found' : 'MISSING'}`);
  if (!exists) {
    missingPackages.push({ name: packageJson.name, path: packagePath });
  }
}

if (missingPackages.length > 0) {
  console.error(`
The following packages do not exist on npm:
`);
  for (const pkg of missingPackages) {
    console.error(`  - ${pkg.name} (${pkg.path})`);
  }
  console.error(`
This repository uses npm trusted publishing, which cannot create new packages.
New packages must be created manually before they can be published via trusted publishing.

To create these packages:

1. Use the setup-npm-trusted-publish tool to create a placeholder package:
   npx setup-npm-trusted-publish <package-name>

   See https://www.npmjs.com/package/setup-npm-trusted-publish for more details.

2. After creating the package, configure trusted publishing in npm:
   - Go to https://www.npmjs.com/package/<package-name>/access
   - Under "Publishing access", click "Add a new provider"
   - Configure the GitHub Actions provider with this repository
`);
  process.exit(1);
}

console.log('\nAll non-private packages exist on npm.');
