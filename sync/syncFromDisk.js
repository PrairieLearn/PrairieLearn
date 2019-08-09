// @ts-check
const ERR = require('async-stacktrace');
const _ = require('lodash');
const async = require('async');
const util = require('util');

const namedLocks = require('../lib/named-locks');
const courseDB = require('./course-db');
const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');

const syncCourseInfo = require('./fromDisk/courseInfo');
const syncCourseInstances = require('./fromDisk/courseInstances');
const syncCourseStaff = require('./fromDisk/courseStaff');
const syncTopics = require('./fromDisk/topics');
const syncQuestions = require('./fromDisk/questions');
const syncTags = require('./fromDisk/tags');
const syncAssessmentSets = require('./fromDisk/assessmentSets');
const syncAssessments = require('./fromDisk/assessments');
const freeformServer = require('../question-servers/freeform');
const perf = require('./performance')('sync');

const sql = sqlLoader.loadSqlEquiv(__filename);

// Performance data can be logged by setting the `PROFILE_SYNC` environment variable

/**
 * 
 * @param {string} courseDir 
 * @param {any} courseId 
 * @param {any} logger 
 */
async function syncDiskToSqlWithLock(courseDir, courseId, logger) {
    logger.info('Loading info.json file from git repository');
    const courseData = await courseDB.loadFullCourseNew(courseDir);
    const missingUuids = await courseDB.getPathsWithMissingUuids(courseData);
    if (missingUuids.length > 0) {
        // If anything is missing UUIDs, error and abort sync immediately
        missingUuids.forEach(item => {
            logger.info(`> ${item.path}`);
            item.errors.forEach(line => logger.info(`* ${line}`));
        });
        logger.error('One or more UUIDs were missing or invalid; aborting sync.');
        return;
    }

    // We can now begin syncing to the DB
}

module.exports._syncDiskToSqlWithLock = function(courseDir, course_id, logger, callback) {
    // Uncomment to use new process
    /*
    util.callbackify(async () => {
        await syncDiskToSqlWithLock(courseDir, course_id, logger);
    })(callback);
    return;
    */
    logger.info("Starting sync of git repository to database for " + courseDir);
    logger.info("Loading info.json files from git repository...");
    perf.start("sync");
    perf.start("loadFullCourse");
    courseDB.loadFullCourse(courseDir, logger, function(err, course, newCourse) {
        perf.end("loadFullCourse");
        if (ERR(err, callback)) return;
        logger.info("Successfully loaded all info.json files");
        // We need to handle assessment sets in two stages: first we add new
        // ones, then we sync assessments, then finally we remove all unused
        // sets.
        let usedAssessmentSetIds;
        async.series([
            function(callback) {logger.info("Syncing courseInfo from git repository to database..."); callback(null);},
            perf.timedFunc.bind(null, "syncCourseInfo", syncCourseInfo.sync.bind(null, course.courseInfo, course_id)),
            function(callback) {logger.info("Syncing courseInstances from git repository to database..."); callback(null);},
            perf.timedFunc.bind(null, "syncCourseInstances", syncCourseInstances.sync.bind(null, course.courseInfo, course.courseInstanceDB)),
            function(callback) {logger.info("Syncing topics from git repository to database..."); callback(null);},
            perf.timedFunc.bind(null, "syncTopics", syncTopics.sync.bind(null, course.courseInfo, course.questionDB)),
            function(callback) {logger.info("Syncing questions from git repository to database..."); callback(null);},
            perf.timedFunc.bind(null, "syncQuestions", syncQuestions.sync.bind(null, course.courseInfo, course.questionDB, logger)),
            function(callback) {logger.info("Syncing tags from git repository to database..."); callback(null);},
            perf.timedFunc.bind(null, "syncTags", syncTags.sync.bind(null, course.courseInfo, course.questionDB)),
            function(callback) {logger.info("Syncing assessment sets from git repository to database..."); callback(null);},
            perf.timedFunc.bind(null, "syncAssessmentSets", (callback) => {
                syncAssessmentSets.sync(course.courseInfo, course.courseInstanceDB, (err, result) => {
                    if (ERR(err, callback)) return;
                    usedAssessmentSetIds = result;
                    callback(null);
                })
            }),
            (callback) => {
                perf.start("syncCourseInstaces");
                // TODO: is running these in parallel safe? Everything should be isolated by course instance.
                async.forEachOf(course.courseInstanceDB, function(courseInstance, courseInstanceShortName, callback) {
                    perf.start(`syncCourseInstance${courseInstanceShortName}`);
                    async.series([
                        function(callback) {logger.info("Syncing " + courseInstanceShortName
                                                        + " courseInstance from git repository to database..."); callback(null);},
                        perf.timedFunc.bind(null, `syncCourseInstance${courseInstanceShortName}Staff`, syncCourseStaff.sync.bind(null, courseInstance)),
                        function(callback) {logger.info("Syncing " + courseInstanceShortName
                                                        + " assessments from git repository to database..."); callback(null);},
                        perf.timedFunc.bind(null, `syncCourseInstance${courseInstanceShortName}Assessments`, syncAssessments.sync.bind(null, course.courseInfo, courseInstance, course.questionDB)),
                    ], function(err) {
                        perf.end(`syncCourseInstance${courseInstanceShortName}`);
                        if (ERR(err, callback)) return;
                        callback(null);
                    });
                }, function(err) {
                    perf.end("syncCourseInstances");
                    if (ERR(err, callback)) return;
                    logger.info("Completed sync of git repository to database");
                    callback(null);
                });
            },
            function(callback) {logger.info("Removing unused assessment sets from database..."); callback(null);},
            perf.timedFunc.bind(null, "syncAssessmentSetsDeleteUnused", (callback) => {
                syncAssessmentSets.deleteUnused(course.courseInfo, usedAssessmentSetIds, (err) => {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            }),
            function(callback) {logger.info("Reloading course elements..."); callback(null);},
            freeformServer.reloadElementsForCourse.bind(null, course.courseInfo),
        ], function(err) {
            perf.end("sync");
            if (ERR(err, callback)) return;
            logger.info("Completed sync of git repository to database");
            callback(null);
        });
    });
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
}

/**
 * @param {string} courseDir
 * @param {string} course_id
 * @param {any} logger
 * @param {(err: Error | null | undefined) => void} callback
 */
module.exports.syncDiskToSql = function(courseDir, course_id, logger, callback) {
    const lockName = 'coursedir:' + courseDir;
    logger.verbose(`Trying lock ${lockName}`);
    namedLocks.tryLock(lockName, (err, lock) => {
        if (ERR(err, callback)) return;
        if (lock == null) {
            logger.verbose(`Did not acquire lock ${lockName}`);
            callback(new Error(`Another user is already syncing or modifying the course: ${courseDir}`));
        } else {
            logger.verbose(`Acquired lock ${lockName}`);
            module.exports._syncDiskToSqlWithLock(courseDir, course_id, logger, (err) => {
                namedLocks.releaseLock(lock, (lockErr) => {
                    if (ERR(lockErr, callback)) return;
                    if (ERR(err, callback)) return;
                    logger.verbose(`Released lock ${lockName}`);
                    callback(null);
                });
            });
        }
    });
};

module.exports.syncOrCreateDiskToSql = function(courseDir, logger, callback) {
    sqldb.callOneRow('select_or_insert_course_by_path', [courseDir], function(err, result) {
        if (ERR(err, callback)) return;
        const course_id = result.rows[0].course_id;
        module.exports.syncDiskToSql(courseDir, course_id, logger, function(err) {
            if (ERR(err, callback)) return;
            callback(null);
        });
    });
};
