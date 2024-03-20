import * as crypto from 'node:crypto';
import express = require('express');
import * as fs from 'node:fs';
import * as path from 'node:path';
import { hashElement, type HashElementNode } from 'folder-hash';
import * as compiledAssets from '@prairielearn/compiled-assets';

import { config } from './config';
import { APP_ROOT_PATH } from './paths';
import staticNodeModules = require('../middlewares/staticNodeModules');
import elementFiles = require('../pages/elementFiles/elementFiles');
import { HtmlSafeString } from '@prairielearn/html';

let assetsPrefix: string | null = null;
let elementsHash: HashElementNode | null = null;
let publicHash: HashElementNode | null = null;
const cachedPackageVersionHashes: Record<string, string> = {};

async function computeElementsHash() {
  elementsHash = await hashElement(path.join(APP_ROOT_PATH, 'elements'), { encoding: 'hex' });
}

async function computePublicHash() {
  publicHash = await hashElement(path.join(APP_ROOT_PATH, 'public'), { encoding: 'hex' });
}

/**
 * With a {@link HashElementNode} representing the hash of a directory, returns
 * a hash of a file within that directory.
 */
function getHashForPath(hashes: HashElementNode, assetPath: string): string {
  const components = assetPath.split('/');
  let currentHashes = hashes;
  for (const component of components) {
    const child = currentHashes.children.find((c) => c.name === component);
    if (!child) {
      // If we can't find a hash, the file probably doesn't exist. Use the highest
      // level hash we have.
      break;
    }
    currentHashes = child;
  }

  return currentHashes.hash.slice(0, 16);
}

/**
 * For an asset path to a file within a `node_modules` directory, returns the
 * name of the package that contains the file. For instance, for an asset path
 * `foo/bar.js`, returns `foo`, and for an asset path `@scope/foo/bar/baz.js`,
 * returns `@scope/foo`.
 */
function getPackageNameForAssetPath(assetPath: string): string {
  const [maybeScope, maybeModule] = assetPath.split('/');
  if (maybeScope.indexOf('@') === 0) {
    // This is a scoped module
    return `${maybeScope}/${maybeModule}`;
  } else {
    return maybeScope;
  }
}

/**
 * Returns the version of the given package within `node_modules`.
 */
function getPackageVersion(packageName: string): string {
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
      'package.json',
    );

    const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
    return pkgJson.version;
  }
}

/**
 * For an asset path to a file within a `node_modules` directory, returns a
 * hash of the version of the package that contains the file.
 */
function getNodeModulesAssetHash(assetPath: string): string {
  const packageName = getPackageNameForAssetPath(assetPath);

  // Reading files synchronously and computing cryptographic hashes are both
  // relatively expensive; cache the hashes for each package.
  let hash = cachedPackageVersionHashes[packageName];
  if (!hash) {
    const version = getPackageVersion(packageName);
    hash = crypto.createHash('sha256').update(version).digest('hex').slice(0, 16);
    cachedPackageVersionHashes[packageName] = hash;
  }
  return hash;
}

function assertAssetsPrefix(): string {
  if (!assetsPrefix) {
    throw new Error('init() must be called before accessing assets');
  }
  return assetsPrefix;
}

/**
 * Computes the hashes of directories from which we serve cacheable assets.
 * Should be run at server startup before any responses are served.
 *
 * Also initializes the assets compiler.
 */
export async function init() {
  await Promise.all([computeElementsHash(), computePublicHash()]);
  assetsPrefix = config.assetsPrefix;

  await compiledAssets.init({
    dev: config.devMode,
    sourceDirectory: path.resolve(APP_ROOT_PATH, 'assets'),
    buildDirectory: path.resolve(APP_ROOT_PATH, 'public/build'),
    publicPath: `${assetsPrefix}/build`,
  });
}

/**
 * Shuts down the development assets compiler if it is running.
 */
export async function close() {
  await compiledAssets.close();
}

/**
 * Applies middleware to the given Express app to serve static assets.
 */
export function applyMiddleware(app: express.Application) {
  const assetsPrefix = assertAssetsPrefix();
  const router = express.Router();

  // Compiled assets have a digest/hash embedded in their filenames, so they
  // don't require a separate cachebuster.
  router.use('/build', compiledAssets.handler());

  router.use(
    '/node_modules/:cachebuster',
    staticNodeModules('.', {
      // In dev mode, we assume that `node_modules` won't change while the server
      // is running, so we'll enable long-term caching.
      maxAge: '1y',
      immutable: true,
    }),
  );
  router.use(
    '/public/:cachebuster',
    express.static(path.join(APP_ROOT_PATH, 'public'), {
      // In dev mode, assets are likely to change while the server is running,
      // so we'll prevent them from being cached.
      maxAge: config.devMode ? 0 : '1y',
      immutable: !config.devMode,
    }),
  );
  router.use('/elements/:cachebuster', elementFiles);

  app.use(assetsPrefix, router);
}

/**
 * Returns the path that the given asset should be accessed from by clients.
 *
 * @param assetPath The path to the file inside the `/public` directory.
 */
export function assetPath(assetPath: string): string {
  const assetsPrefix = assertAssetsPrefix();
  const hash = getHashForPath(publicHash as HashElementNode, assetPath);
  return `${assetsPrefix}/public/${hash}/${assetPath}`;
}

/**
 * Returns the path that the given asset in node_modules should be accessed
 * from by clients.
 *
 * @param assetPath The path to the file inside the `/node_modules` directory.
 */
export function nodeModulesAssetPath(assetPath: string): string {
  const assetsPrefix = assertAssetsPrefix();
  const hash = getNodeModulesAssetHash(assetPath);
  return `${assetsPrefix}/node_modules/${hash}/${assetPath}`;
}

/**
 * Returns the path a given core element asset path should be served from.
 * Will include a hash of the `/elements` directory in the URL to allow for
 * assets to be immutably cached by clients.
 */
export function coreElementAssetPath(assetPath: string): string {
  const assetsPrefix = assertAssetsPrefix();
  const hash = getHashForPath(elementsHash as HashElementNode, assetPath);
  return `${assetsPrefix}/elements/${hash}/${assetPath}`;
}

/**
 * Returns the path a given course element asset should be served from.
 * Takes into account the URL prefix and course hash to allow for
 * clients to immutably cache assets.
 */
export function courseElementAssetPath(
  courseHash: string,
  urlPrefix: string,
  assetPath: string,
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
  assetPath: string,
): string {
  if (!courseHash) {
    // If for some reason we don't have a course hash, fall back to the
    // non-cached path so that we don't accidentally instruct the client
    // to indefinitely cache a file without a proper cachebuster.
    return `${urlPrefix}/elementExtensions/${assetPath}`;
  }

  return `${urlPrefix}/cacheableElementExtensions/${courseHash}/${assetPath}`;
}

export function compiledScriptTag(sourceFile: string): HtmlSafeString {
  return compiledAssets.compiledScriptTag(sourceFile);
}

export function compiledStylesheetTag(sourceFile: string): HtmlSafeString {
  return compiledAssets.compiledStylesheetTag(sourceFile);
}

export function compiledScriptPath(sourceFile: string): string {
  return compiledAssets.compiledScriptPath(sourceFile);
}

export function compiledStylesheetPath(sourceFile: string): string {
  return compiledAssets.compiledStylesheetPath(sourceFile);
}
