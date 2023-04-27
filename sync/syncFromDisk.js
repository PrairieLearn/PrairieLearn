// @ts-check
const ERR = require('async-stacktrace');
const util = require('util');

const namedLocks = require('@prairielearn/named-locks');
const courseDB = require('./course-db');
const sqldb = require('@prairielearn/postgres');

const { config } = require('../lib/config');

const syncCourseInfo = require('./fromDisk/courseInfo');
const syncCourseInstances = require('./fromDisk/courseInstances');
const syncTopics = require('./fromDisk/topics');
const syncQuestions = require('./fromDisk/questions');
const syncTags = require('./fromDisk/tags');
const syncAssessmentSets = require('./fromDisk/assessmentSets');
const syncAssessmentModules = require('./fromDisk/assessmentModules');
const syncAssessments = require('./fromDisk/assessments');
const freeformServer = require('../question-servers/freeform');
const perf = require('./performance')('sync');
const { chalk, chalkDim } = require('../lib/chalk');

const { promisify } = require('util');

// Performance data can be logged by setting the `PROFILE_SYNC` environment variable

/**
 * @typedef {Object} SyncResults
 * @property {boolean} hadJsonErrors
 * @property {string} courseId
 * @property {import('./course-db').CourseData} courseData
 */

/**
 *
 * @param {string} courseDir
 * @param {any} courseId
 * @param {any} logger
 * @returns Promise<SyncResults>
 */
async function syncDiskToSqlWithLock(courseDir, courseId, logger) {
  logger.info('Loading info.json files from course repository');
  perf.start('sync');

  const courseData = await perf.timedAsync('loadCourseData', () =>
    courseDB.loadFullCourse(courseDir)
  );
  logger.info('Syncing info to database');
  await perf.timedAsync('syncCourseInfo', () => syncCourseInfo.sync(courseData, courseId));
  const courseInstanceIds = await perf.timedAsync('syncCourseInstances', () =>
    syncCourseInstances.sync(courseId, courseData)
  );
  await perf.timedAsync('syncTopics', () => syncTopics.sync(courseId, courseData));
  const questionIds = await perf.timedAsync('syncQuestions', () =>
    syncQuestions.sync(courseId, courseData)
  );
  await perf.timedAsync('syncTags', () => syncTags.sync(courseId, courseData, questionIds));
  await perf.timedAsync('syncAssessmentSets', () => syncAssessmentSets.sync(courseId, courseData));
  await perf.timedAsync('syncAssessmentModules', () =>
    syncAssessmentModules.sync(courseId, courseData)
  );
  perf.start('syncAssessments');
  await Promise.all(
    Object.entries(courseData.courseInstances).map(async ([ciid, courseInstanceData]) => {
      const courseInstanceId = courseInstanceIds[ciid];
      await perf.timedAsync(`syncAssessments${ciid}`, () =>
        syncAssessments.sync(
          courseId,
          courseInstanceId,
          courseInstanceData.assessments,
          questionIds
        )
      );
    })
  );
  perf.end('syncAssessments');
  if (config.devMode) {
    logger.info('Flushing course element and extensions cache...');
    freeformServer.flushElementCache();
  }
  const courseDataHasErrors = courseDB.courseDataHasErrors(courseData);
  const courseDataHasErrorsOrWarnings = courseDB.courseDataHasErrorsOrWarnings(courseData);
  if (courseDataHasErrors) {
    logger.info(chalk.red('✖ Some JSON files contained errors and were unable to be synced'));
  } else if (courseDataHasErrorsOrWarnings) {
    logger.info(
      chalk.yellow('⚠ Some JSON files contained warnings but all were successfully synced')
    );
  } else {
    logger.info(chalk.green('✓ Course sync successful'));
  }

  // Note that we deliberately log warnings/errors after syncing to the database
  // since in some cases we actually discover new warnings/errors during the
  // sync process. For instance, we don't actually validate exam UUIDs until
  // the database sync step.
  courseDB.writeErrorsAndWarningsForCourseData(courseId, courseData, (line) =>
    logger.info(line || '')
  );

  perf.end('sync');
  return {
    hadJsonErrors: courseDataHasErrors,
    hadJsonErrorsOrWarnings: courseDataHasErrorsOrWarnings,
    courseId,
    courseData,
  };
}

/**
 * @param {string} courseDir
 * @param {any} course_id
 * @param {any} logger
 * @param {(err: Error | null, result: SyncResults) => void} callback
 */
module.exports._syncDiskToSqlWithLock = function (courseDir, course_id, logger, callback) {
  util.callbackify(async () => {
    return await syncDiskToSqlWithLock(courseDir, course_id, logger);
  })(callback);
};

/**
 * @param {string} courseDir
 * @param {string} course_id
 * @param {any} logger
 * @param {(err: Error | null, result?: SyncResults) => void} callback
 */
module.exports.syncDiskToSql = function (courseDir, course_id, logger, callback) {
  const lockName = 'coursedir:' + courseDir;
  logger.verbose(chalkDim(`Trying lock ${lockName}`));
  namedLocks.tryLock(lockName, (err, lock) => {
    if (ERR(err, callback)) return;
    if (lock == null) {
      logger.verbose(chalk.red(`Did not acquire lock ${lockName}`));
      callback(new Error(`Another user is already syncing or modifying the course: ${courseDir}`));
    } else {
      logger.verbose(chalkDim(`Acquired lock ${lockName}`));
      module.exports._syncDiskToSqlWithLock(courseDir, course_id, logger, (err, result) => {
        namedLocks.releaseLock(lock, (lockErr) => {
          if (ERR(lockErr, callback)) return;
          if (ERR(err, callback)) return;
          logger.verbose(chalkDim(`Released lock ${lockName}`));
          callback(null, result);
        });
      });
    }
  });
};
module.exports.syncDiskToSqlAsync = promisify(module.exports.syncDiskToSql);

/**
 * @param {string} courseDir
 * @param {any} logger
 * @param {(err: Error | null, result?: SyncResults) => void} callback
 */
module.exports.syncOrCreateDiskToSql = function (courseDir, logger, callback) {
  sqldb.callOneRow('select_or_insert_course_by_path', [courseDir], function (err, result) {
    if (ERR(err, callback)) return;
    const course_id = result.rows[0].course_id;
    module.exports.syncDiskToSql(courseDir, course_id, logger, function (err, result) {
      if (ERR(err, callback)) return;
      callback(null, result);
    });
  });
};
