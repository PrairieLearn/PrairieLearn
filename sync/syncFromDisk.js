var ERR = require('async-stacktrace');
var _ = require('lodash');
var async = require('async');

var courseDB = require('../lib/course-db');
var sqldb = require('@prairielearn/prairielib/sql-db');

var syncCourseInfo = require('./fromDisk/courseInfo');
var syncCourseInstances = require('./fromDisk/courseInstances');
var syncCourseStaff = require('./fromDisk/courseStaff');
var syncTopics = require('./fromDisk/topics');
var syncQuestions = require('./fromDisk/questions');
var syncTags = require('./fromDisk/tags');
var syncAssessmentSets = require('./fromDisk/assessmentSets');
var syncAssessments = require('./fromDisk/assessments');
var freeformServer = require('../question-servers/freeform');

module.exports = {};

module.exports.syncDiskToSql = function(courseDir, course_id, logger, callback) {
    logger.info("Starting sync of git repository to database for " + courseDir);
    logger.info("Loading info.json files from git repository...");
    courseDB.loadFullCourse(courseDir, logger, function(err, course) {
        if (ERR(err, callback)) return;
        logger.info("Successfully loaded all info.json files");
        async.series([
            function(callback) {logger.info("Syncing courseInfo from git repository to database..."); callback(null);},
            syncCourseInfo.sync.bind(null, course.courseInfo, course_id),
            function(callback) {logger.info("Syncing courseInstances from git repository to database..."); callback(null);},
            syncCourseInstances.sync.bind(null, course.courseInfo, course.courseInstanceDB),
            function(callback) {logger.info("Syncing topics from git repository to database..."); callback(null);},
            syncTopics.sync.bind(null, course.courseInfo),
            function(callback) {logger.info("Syncing questions from git repository to database..."); callback(null);},
            syncQuestions.sync.bind(null, course.courseInfo, course.questionDB, logger),
            function(callback) {logger.info("Syncing tags from git repository to database..."); callback(null);},
            syncTags.sync.bind(null, course.courseInfo, course.questionDB),
            function(callback) {logger.info("Syncing assessment sets from git repository to database..."); callback(null);},
            syncAssessmentSets.sync.bind(null, course.courseInfo),
            (callback) => {
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
                    if (ERR(err, callback)) return;
                    logger.info("Completed sync of git repository to database");
                    callback(null);
                });
            },
            function(callback) {logger.info("Reloading course elements..."); callback(null);},
            freeformServer.reloadElementsForCourse.bind(null, course.courseInfo),
        ], function(err) {
            if (ERR(err, callback)) return;
            logger.info("Completed sync of git repository to database");
            callback(null);
        });
    });
};

module.exports.syncOrCreateDiskToSql = function(courseDir, logger, callback) {
    sqldb.callOneRow('select_or_insert_course_by_path', [courseDir], function(err, result) {
        if (ERR(err, callback)) return;
        var course_id = result.rows[0].course_id;
        module.exports.syncDiskToSql(courseDir, course_id, logger, function(err) {
            if (ERR(err, callback)) return;
            callback(null);
        });
    });
};
