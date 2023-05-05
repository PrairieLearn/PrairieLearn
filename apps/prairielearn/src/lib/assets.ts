import crypto = require('crypto');
import path = require('path');
import fs = require('fs');
import { hashElement } from 'folder-hash';

import { APP_ROOT_PATH } from './paths';

let assetsHash = 'NOT_SET';
let elementsHash = 'NOT_SET';
const cachedPackageVersionHashes = {};

/**
 * Computes the hash of the given directory and returns the first 16 characters.
 */
async function hashDirectory(dir: string): Promise<string> {
  const { hash } = await hashElement(dir, { encoding: 'hex' });
  return hash.slice(0, 16);
}

async function computeAssetsHash() {
  assetsHash = await hashDirectory(path.join(APP_ROOT_PATH, 'public'));
}

async function computeElementsHash() {
  elementsHash = await hashDirectory(path.join(APP_ROOT_PATH, 'elements'));
}

function getPackageVersion(packageName: string) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require(`${packageName}/package.json`).version;
  } catch (e) {
    if (e.code !== 'ERR_PACKAGE_PATH_NOT_EXPORTED') {
      throw e;
    }

    // If we can't directly resolve the package's `package.json` file, we'll
    // `require.resolve` the package itself, and then do a little manipulation
    // to get the `package.json` path from there.

    // Get the resolved path to the package entrypoint, which will look something
    // like `/absolute/path/to/node_modules/package-name/index.js`.
    const pkgPath = require.resolve(packageName);

    // Strip off everything after the last `/node_modules/`, then append the
    // package name.
    const nodeModulesToken = '/node_modules/';
    const lastNodeModulesIndex = pkgPath.lastIndexOf(nodeModulesToken);
    const pkgJsonPath = path.resolve(
      pkgPath.slice(0, lastNodeModulesIndex + nodeModulesToken.length),
      packageName,
      'package.json'
    );

    const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
    return pkgJson.version;
  }
}

/**
 * Computes the hashes of directories from which we serve cacheable assets.
 * Should be run at server startup before any responses are served.
 */
export async function init() {
  await Promise.all([computeAssetsHash(), computeElementsHash()]);
}

/**
 * Returns the path that the given asset should be accessed from by clients.
 *
 * @param assetPath The path to the file inside the `/public` directory.
 */
export function assetPath(assetPath: string): string {
  return `/assets/${assetsHash}/${assetPath}`;
}

/**
 * Returns the path that the given asset in node_modules should be accessed
 * from by clients.
 *
 * @param assetPath The path to the file inside the `/node_modules` directory.
 */
export function nodeModulesAssetPath(assetPath: string): string {
  const [maybeScope, maybeModule] = assetPath.split('/');
  let moduleName;
  if (maybeScope.indexOf('@') === 0) {
    // This is a scoped module
    moduleName = `${maybeScope}/${maybeModule}`;
  } else {
    moduleName = maybeScope;
  }

  // Reading files synchronously and computing cryptographic hashes are both
  // relatively expensive; cache the hashes for each package.
  let hash = cachedPackageVersionHashes[moduleName];
  if (!hash) {
    const version = getPackageVersion(moduleName);
    hash = crypto.createHash('sha256').update(version).digest('hex').slice(0, 16);
    cachedPackageVersionHashes[moduleName] = hash;
  }

  return `/cacheable_node_modules/${hash}/${assetPath}`;
}

/**
 * Returns the path a given core element asset path should be served from.
 * Will include a hash of the `/elements` directory in the URL to allow for
 * assets to be immutably cached by clients.
 */
export function coreElementAssetPath(assetPath: string) {
  return `/pl/static/cacheableElements/${elementsHash}/${assetPath}`;
}

/**
 * Returns the path a given course element asset should be served from.
 * Takes into account the URL prefix and course hash to allow for
 * clients to immutably cache assets.
 */
export function courseElementAssetPath(
  courseHash: string,
  urlPrefix: string,
  assetPath: string
): string {
  if (!courseHash) {
    // If for some reason we don't have a course hash, fall back to the
    // non-cached path so that we don't accidentally instruct the client
    // to indefinitely cache a file without a proper cachebuster.
    return `${urlPrefix}/elements/${assetPath}`;
  }

  return `${urlPrefix}/cacheableElements/${courseHash}/${assetPath}`;
}

/**
 * Returns the path a given course element extension asset should be served from.
 * Takes into account the URL prefix and course hash to allow for
 * clients to immutably cache assets.
 */
export function courseElementExtensionAssetPath(
  courseHash: string,
  urlPrefix: string,
  assetPath: string
): string {
  if (!courseHash) {
    // If for some reason we don't have a course hash, fall back to the
    // non-cached path so that we don't accidentally instruct the client
    // to indefinitely cache a file without a proper cachebuster.
    return `${urlPrefix}/elementExtensions/${assetPath}`;
  }

  return `${urlPrefix}/cacheableElementExtensions/${courseHash}/${assetPath}`;
}
