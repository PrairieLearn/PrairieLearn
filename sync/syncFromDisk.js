const ERR = require('async-stacktrace');
const _ = require('lodash');
const async = require('async');

const namedLocks = require('../lib/named-locks');
const courseDB = require('../lib/course-db');
const sqldb = require('@prairielearn/prairielib/sql-db');

const syncCourseInfo = require('./fromDisk/courseInfo');
const syncCourseInstances = require('./fromDisk/courseInstances');
const syncCourseStaff = require('./fromDisk/courseStaff');
const syncTopics = require('./fromDisk/topics');
const syncQuestions = require('./fromDisk/questions');
const syncTags = require('./fromDisk/tags');
const syncAssessmentSets = require('./fromDisk/assessmentSets');
const syncAssessments = require('./fromDisk/assessments');
const freeformServer = require('../question-servers/freeform');

const perfMarkers = {};

const start = (name) => {
    perfMarkers[name] = new Date();
}

const end = (name) => {
    if (!(name in perfMarkers)) {
        return;
    }
    console.log(`${name} took ${(new Date()) - perfMarkers[name]}ms`);
}

const timedFunc = (name, func, callback) => {
    start(name);
    func((err) => {
        end(name);
        callback(err);
    });
}

module.exports._syncDiskToSqlWithLock = function(courseDir, course_id, logger, callback) {
    logger.info("Starting sync of git repository to database for " + courseDir);
    logger.info("Loading info.json files from git repository...");
    start("sync");
    start("loadFullCourse");
    courseDB.loadFullCourse(courseDir, logger, function(err, course) {
        end("loadFullCourse");
        if (ERR(err, callback)) return;
        logger.info("Successfully loaded all info.json files");
        async.series([
            function(callback) {logger.info("Syncing courseInfo from git repository to database..."); callback(null);},
            timedFunc.bind(null, "syncCourseInfo", syncCourseInfo.sync.bind(null, course.courseInfo, course_id)),
            function(callback) {logger.info("Syncing courseInstances from git repository to database..."); callback(null);},
            timedFunc.bind(null, "syncCourseInstances", syncCourseInstances.sync.bind(null, course.courseInfo, course.courseInstanceDB)),
            function(callback) {logger.info("Syncing topics from git repository to database..."); callback(null);},
            timedFunc.bind(null, "syncTopics", syncTopics.sync.bind(null, course.courseInfo)),
            function(callback) {logger.info("Syncing questions from git repository to database..."); callback(null);},
            timedFunc.bind(null, "syncQuestions", syncQuestions.sync.bind(null, course.courseInfo, course.questionDB, logger)),
            function(callback) {logger.info("Syncing tags from git repository to database..."); callback(null);},
            timedFunc.bind(null, "syncTags", syncTags.sync.bind(null, course.courseInfo, course.questionDB)),
            function(callback) {logger.info("Syncing assessment sets from git repository to database..."); callback(null);},
            timedFunc.bind(null, "syncAssessmentSets", syncAssessmentSets.sync.bind(null, course.courseInfo)),
            (callback) => {
                start("syncCourseInstaces");
                async.forEachOfSeries(course.courseInstanceDB, function(courseInstance, courseInstanceShortName, callback) {
                    async.series([
                        function(callback) {logger.info("Syncing " + courseInstanceShortName
                                                        + " courseInstance from git repository to database..."); callback(null);},
                        syncCourseStaff.sync.bind(null, course.courseInfo, courseInstance),
                        function(callback) {logger.info("Syncing " + courseInstanceShortName
                                                        + " assessments from git repository to database..."); callback(null);},
                        syncAssessments.sync.bind(null, course.courseInfo, courseInstance),
                    ], function(err) {
                        if (ERR(err, callback)) return;
                        callback(null);
                    });
                }, function(err) {
                    end("syncCourseInstances");
                    if (ERR(err, callback)) return;
                    logger.info("Completed sync of git repository to database");
                    callback(null);
                });
            },
            function(callback) {logger.info("Reloading course elements..."); callback(null);},
            freeformServer.reloadElementsForCourse.bind(null, course.courseInfo),
        ], function(err) {
            end("sync");
            if (ERR(err, callback)) return;
            logger.info("Completed sync of git repository to database");
            callback(null);
        });
    });
};

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
            this._syncDiskToSqlWithLock(courseDir, course_id, logger, (err) => {
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
