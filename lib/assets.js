// @ts-check
const crypto = require('crypto');
const path = require('path');

const { hashElement } = require('folder-hash');

let assetsHash = 'NOT_SET';
const cachedPackageVersions = {};

/**
 * Computes the hash of the `/public` directory and its contents. Should be
 * run at server startup before any responses are served.
 */
module.exports.init = async () => {
    const assetsDirectoryHash = await hashElement(
        path.join(__dirname, '..', 'public'),
        {
            encoding: 'hex',
        },
    );
    assetsHash = assetsDirectoryHash.hash.slice(0, 16);
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
        hash = crypto
            .createHash('sha256')
            .update(version)
            .digest('hex')
            .slice(0, 16);
        cachedPackageVersions[version] = hash;
    }
    return `/cacheable_node_modules/${hash}/${assetPath}`;
};
