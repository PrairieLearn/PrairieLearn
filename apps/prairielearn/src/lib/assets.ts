import crypto = require('crypto');
import express = require('express');
import path = require('path');
import { hashElement } from 'folder-hash';
import compiledAssets = require('@prairielearn/compiled-assets');

import { config } from './config';
import { REPOSITORY_ROOT_PATH, APP_ROOT_PATH } from './paths';
import staticNodeModules = require('../middlewares/staticNodeModules');
import elementFiles = require('../pages/elementFiles/elementFiles');
import { HtmlSafeString } from '@prairielearn/html';

let assetsPrefix: string | null = null;

/**
 * Computes the hash of the given path and returns the first 16 characters.
 * The path can be a file or a directory.
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

function assertAssetsPrefix() {
  if (!assetsPrefix) {
    throw new Error('init() must be called before accessing assets');
  }
}

/**
 * Computes the hashes of directories from which we serve cacheable assets.
 * Should be run at server startup before any responses are served.
 *
 * Also initializes the assets compiler.
 */
export async function init() {
  const cachebuster = await computeCachebuster();
  assetsPrefix = `${config.assetsPrefix}/${cachebuster}`;

  compiledAssets.init({
    dev: config.devMode,
    sourceDirectory: path.resolve(APP_ROOT_PATH, 'assets'),
    buildDirectory: path.resolve(APP_ROOT_PATH, 'public/build'),
    publicPath: `${assetsPrefix}/build`,
  });
}

/**
 * Applies middleware to the given Express app to serve static assets.
 */
export function applyMiddleware(app: express.Application) {
  assertAssetsPrefix();
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
}

/**
 * Returns the path that the given asset should be accessed from by clients.
 *
 * @param assetPath The path to the file inside the `/public` directory.
 */
export function assetPath(assetPath: string): string {
  assertAssetsPrefix();
  return `${assetsPrefix}/${assetPath}`;
}

/**
 * Returns the path that the given asset in node_modules should be accessed
 * from by clients.
 *
 * @param assetPath The path to the file inside the `/node_modules` directory.
 */
export function nodeModulesAssetPath(assetPath: string): string {
  assertAssetsPrefix();
  return `${assetsPrefix}/node_modules/${assetPath}`;
}

/**
 * Returns the path a given core element asset path should be served from.
 * Will include a hash of the `/elements` directory in the URL to allow for
 * assets to be immutably cached by clients.
 */
export function coreElementAssetPath(assetPath: string): string {
  assertAssetsPrefix();
  return `${assetsPrefix}/elements/${assetPath}`;
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

export function compiledScriptTag(sourceFile: string): HtmlSafeString {
  assertAssetsPrefix();
  return compiledAssets.compiledScriptTag(sourceFile);
}
