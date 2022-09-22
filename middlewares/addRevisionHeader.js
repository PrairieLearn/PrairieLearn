const asyncHandler = require('express-async-handler');

const { getCurrentRevision } = require('../lib/revision');

module.exports = asyncHandler(async (req, res, next) => {
  try {
    const revision = await getCurrentRevision();
    res.set('X-PrairieLearn-Revision', revision ?? 'unknown');
  } catch {
    res.set('X-PrairieLearn-Revision', 'unknown');
  }

  next();
});
