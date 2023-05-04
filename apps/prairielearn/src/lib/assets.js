// @ts-check
const crypto = require('crypto');
const express = require('express');
const path = require('path');
const fs = require('fs');
const { hashElement } = require('folder-hash');
const compiledAssets = require('@prairielearn/compiled-assets');
const staticNodeModules = require('../middlewares/staticNodeModules');

const { APP_ROOT_PATH } = require('./paths');

let cachebuster = null;
const cachedPackageVersionHashes = {};

/**
 * Computes the hash of the given directory and returns the first 16 characters.
 *
 * @param {string} dir
 * @returns {Promise<string>}
 */
async function hashDirectory(dir) {
  const { hash } = await hashElement(dir, { encoding: 'hex' });
  return hash.slice(0, 16);
}

async function computeCachebuster() {
  const hashes = await Promise.all([
    hashDirectory(path.join(APP_ROOT_PATH, 'public')),
    hashDirectory(path.join(APP_ROOT_PATH, 'elements')),
  ]);
  const hash = crypto.createHash('sha256');
  hashes.forEach((h) => hash.update(h));
  cachebuster = hash.digest('hex').slice(0, 16);
}

function getPackageVersion(packageName) {
  try {
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
module.exports.init = async () => {
  await computeCachebuster();
  await compiledAssets.init({
    dev: config.devMode,
    sourceDirectory: path.resolve(APP_ROOT_PATH, 'assets'),
    buildDirectory: path.resolve(APP_ROOT_PATH, 'public/build'),
    publicPath: '/build',
  });
};

module.exports.middleware = () => {
  const router = express.Router();

  router.use('/build', compiledAssets.handler());
  router.use(
    '/node_modules',
    staticNodeModules('.', {
      maxAge: '31536000s',
      immutable: true,
    })
  );
  router.use(
    express.static(path.join(APP_ROOT_PATH, 'public'), {
      // In dev mode, assets are likely to change while the server is running,
      // so we'll prevent them from being cached.
      maxAge: config.devMode ? 0 : '31536000s',
      immutable: true,
    })
  );
};

/**
 * Returns the path that the given asset should be accessed from by clients.
 *
 * @param {string} assetPath - The path to the file inside the `/public` directory.
 */
module.exports.assetPath = (assetPath) => {
  return `/assets/${assetsHash}/${assetPath}`;
};

/**
 * Returns the path that the given asset in node_modules should be accessed
 * from by clients.
 *
 * @param {string} assetPath - The path to the file inside the `/node_modules` directory.
 */
module.exports.nodeModulesAssetPath = (assetPath) => {
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
};

/**
 * Returns the path a given core element asset path should be served from.
 * Will include a hash of the `/elements` directory in the URL to allow for
 * assets to be immutably cached by clients.
 *
 * @param {string} assetPath
 * @returns {string}
 */
module.exports.coreElementAssetPath = (assetPath) => {
  return `/pl/static/cacheableElements/${elementsHash}/${assetPath}`;
};

/**
 * Returns the path a given course element asset should be served from.
 * Takes into account the URL prefix and course hash to allow for
 * clients to immutably cache assets.
 *
 * @param {string} urlPrefix
 * @param {string} courseHash
 * @param {string} assetPath
 * @returns {string}
 */
module.exports.courseElementAssetPath = (courseHash, urlPrefix, assetPath) => {
  if (!courseHash) {
    // If for some reason we don't have a course hash, fall back to the
    // non-cached path so that we don't accidentally instruct the client
    // to indefinitely cache a file without a proper cachebuster.
    return `${urlPrefix}/elements/${assetPath}`;
  }

  return `${urlPrefix}/cacheableElements/${courseHash}/${assetPath}`;
};

/**
 * Returns the path a given course element extension asset should be served from.
 * Takes into account the URL prefix and course hash to allow for
 * clients to immutably cache assets.
 *
 * @param {string} courseHash
 * @param {string} urlPrefix
 * @param {string} assetPath
 * @returns {string}
 */
module.exports.courseElementExtensionAssetPath = (courseHash, urlPrefix, assetPath) => {
  if (!courseHash) {
    // If for some reason we don't have a course hash, fall back to the
    // non-cached path so that we don't accidentally instruct the client
    // to indefinitely cache a file without a proper cachebuster.
    return `${urlPrefix}/elementExtensions/${assetPath}`;
  }

  return `${urlPrefix}/cacheableElementExtensions/${courseHash}/${assetPath}`;
};

/**
 * @param {string} sourceFile
 * @returns string
 */
module.exports.compiledScriptTag = (sourceFile) => {
  return compiledAssets.compiledScriptTag(sourceFile);
};
