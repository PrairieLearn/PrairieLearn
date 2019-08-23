// @ts-check
const ERR = require('async-stacktrace');
const util = require('util');

const namedLocks = require('../lib/named-locks');
const courseDB = require('./course-db');
const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');

const syncCourseInfo = require('./fromDisk/courseInfo');
const syncCourseInstances = require('./fromDisk/courseInstances');
const syncTopics = require('./fromDisk/topics');
const syncQuestions = require('./fromDisk/questions');
const syncTags = require('./fromDisk/tags');
const syncAssessmentSets = require('./fromDisk/assessmentSets');
const syncAssessments = require('./fromDisk/assessments');
const freeformServer = require('../question-servers/freeform');
const perf = require('./performance')('sync');
const { chalk, chalkDim } = require('../lib/chalk');

const sql = sqlLoader.loadSqlEquiv(__filename);

// Performance data can be logged by setting the `PROFILE_SYNC` environment variable

/**
 * 
 * @param {string} courseDir 
 * @param {any} courseId 
 * @param {any} logger 
 * @returns {{ hadJsonErrors: boolean }}
 */
async function syncDiskToSqlWithLock(courseDir, courseId, logger) {
    logger.info('Loading info.json files from course repository');
    perf.start('sync');
    const courseData = await perf.timedAsync('loadCourseData', () => courseDB.loadFullCourseNew(courseDir));
    // Write any errors and warnings to sync log
    courseDB.writeErrorsAndWarningsForCourseData(courseId, courseData, line => logger.info(line || ''));
    logger.info('Syncing info to database');
    await perf.timedAsync('syncCourseInfo', () => syncCourseInfo.sync(courseData, courseId));
    const courseInstanceIds = await perf.timedAsync('syncCourseInstances', () => syncCourseInstances.sync(courseId, courseData));
    await perf.timedAsync('syncTopics', () => syncTopics.sync(courseId, courseData));
    const questionIds = await perf.timedAsync('syncQuestions', () => syncQuestions.sync(courseId, courseData));
    await perf.timedAsync('syncTags', () => syncTags.sync(courseId, courseData, questionIds));
    const assessmentSets = await perf.timedAsync('syncAssessmentSets', () => syncAssessmentSets.sync(courseId, courseData));
    perf.start('syncAssessments');
    await Promise.all(Object.entries(courseData.courseInstances).map(async ([ciid, courseInstanceData]) => {
        const courseInstanceId = courseInstanceIds[ciid];
        await perf.timedAsync(`syncAssessments${ciid}`, () => syncAssessments.sync(courseId, courseInstanceId, courseInstanceData.assessments, questionIds));
    }));
    perf.end('syncAssessments');
    if (assessmentSets.deleteUnused) {
        await perf.timedAsync('deleteUnusedAssessmentSets', () => syncAssessmentSets.deleteUnusedNew(courseId, assessmentSets.usedAssessmentSetIds));
    }
    await freeformServer.reloadElementsForCourse(courseDir, courseId);
    const courseDataHasErrors = courseDB.courseDataHasErrors(courseData);
    if (courseDataHasErrors) {
        logger.info(chalk.yellow('⚠ Some JSON files contained errors and were unable to be synced'));
    } else {
        logger.info(chalk.green('✓ Course sync successful'));
    }
    perf.end('sync');
    return {
        hadJsonErrors: courseDataHasErrors,
    };
}

/**
 * @param {string} courseDir
 * @param {any} course_id
 * @param {any} logger
 * @param {(err: Error | null | undefined, result: { hadJsonErrors: boolean }) => void} callback
 */
module.exports._syncDiskToSqlWithLock = function(courseDir, course_id, logger, callback) {
    util.callbackify(async () => {
        return await syncDiskToSqlWithLock(courseDir, course_id, logger);
    })(callback);
};

/**
 * Gets the ID for the course with the given directory.
 * @param {string} courseDir The course directory
 * @returns {Promise.<string>} The ID of the course
 */
async function getCourseId(courseDir) {
    const params = {
        path: courseDir,
    };
    const res = await sqldb.queryOneRowAsync(sql.select_course_id, params);
    return res.rows[0].id;
}

/**
 * Checks if it's safe to perform an incremental sync on an entity with an ID
 * (QID, TID, etc.) and a UUID.
 * @param {string} syncingUuid The UUID of the entity being synced
 * @param {string | null} existingId A matching entity ID based on `syncingUuid`
 * @param {string | null} existingUuid A matching UUID based on `syncingQid`
 * @returns {boolean} Whether or not an incremental sync is safe
 */
function isEntityIncrementalSyncSafe(syncingUuid, existingId, existingUuid) {
    if (existingUuid) {
        // There's a entity with this ID; we have a UUID for it
        if (existingUuid === syncingUuid) {
            // The UUID did not change; incremental sync is safe
            return true;
        }
        // The UUID changed; fall back to a full sync for safety
        return false;
    } else {
        // There's no existing entity with this ID
        // Either this was a renamed entity, in which case the existing one with
        // a matching UUID should be overwritten, or this is a new entity and there's
        // no UUID overlap. In either case, incremental sync is safe.
        return true;
    }
}

async function isQuestionIncrementalSyncSafe(courseId, qid, questionInfo) {
    const integrityCheckParams = {
        qid,
        uuid: questionInfo.uuid,
        course_id: courseId,
    };
    const integrityCheckRes = await sqldb.queryZeroOrOneRowAsync(sql.select_for_integrity_check, integrityCheckParams);
    if (integrityCheckRes.rows.length === 0) {
        // There's no QID or UUID overlap; incremental sync is safe
        return true;
    }
    // We located an existing question with either a matching UUID or QID
    // To safely do a partial sync, we must ensure that if there's an existing
    // question with this QID, that the UUID has not changed. Otherwise, we run
    // the risk of not detecting duplicate UUIDs. If the UUID was not stable,
    // we'll fall back to a full sync
    const { uuid: matchingUuid, qid: matchingQid } = integrityCheckRes.rows[0];
    return isEntityIncrementalSyncSafe(questionInfo.uuid, matchingQid, matchingUuid);
}

/**
 * @param {string} courseDir
 * @param {string} qid
 * @param {any} logger
 * @returns {Promise.<{ fullSync: boolean }>} Indicates if a full sync was performed
 */
module.exports.syncSingleQuestion = async function(courseDir, qid, logger) {
    const [courseId, questionInfo] = await Promise.all([
        getCourseId(courseDir),
        courseDB.loadSingleQuestion(courseDir, qid),
    ]);
    if (!(await isQuestionIncrementalSyncSafe(courseId, qid, questionInfo))) {
        // Fall back to full sync
        await (util.promisify(module.exports.syncDiskToSql))(courseDir, courseId, logger);
        return { fullSync: true };
    }

    await syncQuestions.syncSingleQuestion(courseDir, questionInfo, logger);
    return { fullSync: false };
};

/**
 * @param {string} courseDir
 * @param {string} course_id
 * @param {any} logger
 * @param {(err: Error | null | undefined, result?: { hadJsonErrors: boolean }) => void} callback
 */
module.exports.syncDiskToSql = function(courseDir, course_id, logger, callback) {
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

/**
 * @param {string} courseDir
 * @param {any} logger
 * @param {(err: Error | null | undefined, result?: { hadJsonErrors: boolean }) => void} callback
 */
module.exports.syncOrCreateDiskToSql = function(courseDir, logger, callback) {
    sqldb.callOneRow('select_or_insert_course_by_path', [courseDir], function(err, result) {
        if (ERR(err, callback)) return;
        const course_id = result.rows[0].course_id;
        module.exports.syncDiskToSql(courseDir, course_id, logger, function(err, result) {
            if (ERR(err, callback)) return;
            callback(null, result);
        });
    });
};
