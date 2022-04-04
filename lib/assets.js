// @ts-check
const crypto = require('crypto');
const path = require('path');

const { hashElement } = require('folder-hash');

let assetsHash = 'NOT_SET';
let elementsHash = 'NOT_SET';
const cachedPackageVersions = {};

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

async function computeAssetsHash() {
  assetsHash = await hashDirectory(path.join(__dirname, '..', 'public'));
}

async function computeElementsHash() {
  elementsHash = await hashDirectory(path.join(__dirname, '..', 'elements'));
}

/**
 * Computes the hashes of directories from which we serve cacheable assets.
 * Should be run at server startup before any responses are served.
 */
module.exports.init = async () => {
  await Promise.all([computeAssetsHash(), computeElementsHash()]);
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
  const version = require(`${moduleName}/package.json`).version;

  // Cryptography operations are potentially expensive, so we'll cache the
  // hashed version info.
  let hash = cachedPackageVersions[version];
  if (!hash) {
    hash = crypto.createHash('sha256').update(version).digest('hex').slice(0, 16);
    cachedPackageVersions[version] = hash;
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
