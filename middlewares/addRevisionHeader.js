const asyncHandler = require('express-async-handler');

const { getCurrentRevision } = require('../lib/revision');

module.exports = asyncHandler(async (req, res, next) => {
  const revision = await getCurrentRevision();
  res.set('X-PrairieLearn-Revision', revision ?? 'unknown');

  next();
});
