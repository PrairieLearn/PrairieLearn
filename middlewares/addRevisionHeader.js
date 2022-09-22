const { createCache } = require('async-cache-dedupe');
const execa = require('execa');
const asyncHandler = require('express-async-handler');

// We use `async-cache-dedupe` so that we don't end up with a bunch of concurrent
// Git subprocesses.
const cache = createCache({
  ttl: 60, // seconds
  storage: { type: 'memory' },
});

cache.define('getCurrentRevision', async () => {
  return (await execa('git', ['rev-parse', 'HEAD'])).stdout.trim();
});

module.exports = asyncHandler(async (req, res, next) => {
  try {
    const revision = await cache.getCurrentRevision();
    res.set('X-PrairieLearn-Revision', revision);
  } catch {
    res.set('X-PrairieLearn-Revision', 'unknown');
  }

  next();
});
