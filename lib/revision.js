const execa = require('execa');
const { createCache } = require('async-cache-dedupe');

// We're using this module because it allows us to deduplicate concurrent requests
// for the revision; we don't actually rely on it caching the result (we'll do that
// ourselves, as the revision should never change for the life of a given process).
const cache = createCache({
  ttl: 0, // don't cache the result
  storage: { type: 'memory' },
});

cache.define('getCurrentRevision', async () => {
  return (await execa('git', ['rev-parse', 'HEAD'])).stdout.trim();
});

let currentRevision;

module.exports.getCurrentRevision = async function () {
  // Note that we treat `null` and `undefined` differently here. Undefined
  // means we haven't yet tried to retrieve the revision, whereas null means
  // that we encountered an error while fetching the revision. This lets us
  // avoid spamming subprocesses if e.g. git isn't installed.
  if (currentRevision === undefined) {
    try {
      currentRevision = await cache.getCurrentRevision();
    } catch {
      currentRevision = null;
    }
  }

  return currentRevision;
};
