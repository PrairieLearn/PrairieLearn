// @ts-check
const { TEST_COURSE_PATH } = require('../lib/paths');
const syncFromDisk = require('../sync/syncFromDisk');
const { makeMockLogger } = require('./mockLogger');

async function syncCourse(courseDir = TEST_COURSE_PATH, options = { allowSyncFailure: false }) {
  const { logger, getOutput } = makeMockLogger();
  const result = await syncFromDisk.syncOrCreateDiskToSqlAsync(courseDir, logger);
  if (!result || (result.hadJsonErrorsOrWarnings && !options.allowSyncFailure)) {
    console.log(getOutput());
    throw new Error(`Errors or warnings found during sync of ${courseDir}`);
  }
}

module.exports.syncCourse = syncCourse;
