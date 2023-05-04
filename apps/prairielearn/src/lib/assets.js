// @ts-check
const crypto = require('crypto');
const express = require('express');
const path = require('path');
const { hashElement } = require('folder-hash');
const compiledAssets = require('@prairielearn/compiled-assets');

const { config } = require('./config');
const { REPOSITORY_ROOT_PATH, APP_ROOT_PATH } = require('./paths');
const staticNodeModules = require('../middlewares/staticNodeModules');
const elementFiles = require('../pages/elementFiles/elementFiles');

let assetsPrefix = null;

/**
 * Computes the hash of the given path and returns the first 16 characters.
 * The path can be a file or a directory.
 *
 * @param {string} pathToHash
 * @returns {Promise<string>}
 */
async function hashPath(pathToHash) {
  const { hash } = await hashElement(pathToHash, { encoding: 'hex' });
  return hash.slice(0, 16);
}

async function computeCachebuster() {
  const hashes = await Promise.all([
    hashPath(path.join(APP_ROOT_PATH, 'public')),
    hashPath(path.join(APP_ROOT_PATH, 'elements')),
    hashPath(path.join(REPOSITORY_ROOT_PATH, 'yarn.lock')),
  ]);
  const hash = crypto.createHash('sha256');
  hashes.forEach((h) => hash.update(h));
  return hash.digest('hex').slice(0, 16);
}

/**
 * Computes the hashes of directories from which we serve cacheable assets.
 * Should be run at server startup before any responses are served.
 *
 * Also initializes the assets compiler.
 */
module.exports.init = async () => {
  const cachebuster = await computeCachebuster();
  assetsPrefix = `${config.assetsPrefix}/${cachebuster}`;

  compiledAssets.init({
    dev: config.devMode,
    sourceDirectory: path.resolve(APP_ROOT_PATH, 'assets'),
    buildDirectory: path.resolve(APP_ROOT_PATH, 'public/build'),
    publicPath: `${assetsPrefix}/build`,
  });
};

/**
 * Applies middleware to the given Express app to serve static assets.
 *
 * @param {import('express').Application} app
 */
module.exports.applyMiddleware = (app) => {
  const router = express.Router();

  router.use('/build', compiledAssets.handler());
  router.use(
    '/node_modules/',
    staticNodeModules('.', {
      maxAge: '31536000s',
      immutable: true,
    })
  );
  router.use('/elements', elementFiles);
  router.use(
    express.static(path.join(APP_ROOT_PATH, 'public'), {
      // In dev mode, assets are likely to change while the server is running,
      // so we'll prevent them from being cached.
      maxAge: config.devMode ? 0 : '31536000s',
      immutable: true,
    })
  );

  app.use(`${config.assetsPrefix}/:cachebuster`, router);
};

/**
 * Returns the path that the given asset should be accessed from by clients.
 *
 * @param {string} assetPath - The path to the file inside the `/public` directory.
 */
module.exports.assetPath = (assetPath) => {
  return `${assetsPrefix}/${assetPath}`;
};

/**
 * Returns the path that the given asset in node_modules should be accessed
 * from by clients.
 *
 * @param {string} assetPath - The path to the file inside the `/node_modules` directory.
 */
module.exports.nodeModulesAssetPath = (assetPath) => {
  return `${assetsPrefix}/node_modules/${assetPath}`;
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
  return `${assetsPrefix}/elements/${assetPath}`;
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
