#!/usr/bin/env node
// @ts-check
//
// Checks that all non-private packages in `packages/` exist on npm. This is
// needed because trusted publishing can only update existing packages, not
// create new ones.

import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const PACKAGES_DIR = 'packages';

/**
 * Check if a package exists on npm.
 * @param {string} packageName
 * @returns {Promise<boolean>}
 */
async function packageExistsOnNpm(packageName) {
  // Use the /latest endpoint to avoid fetching the full package metadata
  const url = `https://registry.npmjs.org/${encodeURIComponent(packageName)}/latest`;
  try {
    const response = await fetch(url);
    return response.ok;
  } catch {
    // Network errors should be treated as a failure
    return false;
  }
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
