// @ts-check
const path = require('node:path');

const syncFromDisk = require('../sync/syncFromDisk');
const { makeMockLogger } = require('./mockLogger');

const courseDirDefault = path.join(__dirname, '..', 'testCourse');

async function syncCourse(courseDir = courseDirDefault) {
  const { logger, getOutput } = makeMockLogger();
  const result = await syncFromDisk.syncOrCreateDiskToSqlAsync(courseDir, logger);
  if (result.hadJsonErrorsOrWarnings) {
    console.log(getOutput());
    throw new Error(`Errors or warnings found during sync of ${courseDir}`);
  }
}

module.exports.syncCourse = syncCourse;
