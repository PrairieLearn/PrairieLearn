var async = require('async');

var logger = require('../lib/logger');
var courseDB = require('../lib/course-db');

var syncCourseInfo = require('./fromDisk/courseInfo');
var syncCourseInstances = require('./fromDisk/courseInstances');
var syncCourseStaff = require('./fromDisk/courseStaff');
var syncTopics = require('./fromDisk/topics');
var syncQuestions = require('./fromDisk/questions');
var syncTags = require('./fromDisk/tags');
var syncAssessmentSets = require('./fromDisk/assessmentSets');
var syncAssessments = require('./fromDisk/assessments');

module.exports = {};

module.exports.syncDiskToSql = function(courseDir, logger, callback) {
    logger.info("Starting sync of git repository to database for " + courseDir);
    logger.info("Loading info.json files from git repository...");
    courseDB.loadFullCourse(courseDir, function(err, course) {
        if (err) return callback(err);
        logger.info("Successfully loaded all info.json files");
        async.series([
            function(callback) {logger.info("Syncing courseInfo from git repository to database..."); callback(null);},
            syncCourseInfo.sync.bind(null, course.courseInfo),
            function(callback) {logger.info("Syncing courseInstances from git repository to database..."); callback(null);},
            syncCourseInstances.sync.bind(null, course.courseInfo, course.courseInstanceDB),
            function(callback) {logger.info("Syncing topics from git repository to database..."); callback(null);},
            syncTopics.sync.bind(null, course.courseInfo),
            function(callback) {logger.info("Syncing questions from git repository to database..."); callback(null);},
            syncQuestions.sync.bind(null, course.courseInfo, course.questionDB),
            function(callback) {logger.info("Syncing tags from git repository to database..."); callback(null);},
            syncTags.sync.bind(null, course.courseInfo, course.questionDB),
            function(callback) {logger.info("Syncing assessment sets from git repository to database..."); callback(null);},
            syncAssessmentSets.sync.bind(null, course.courseInfo),
        ], function(err) {
            if (err) return callback(err);
            async.forEachOfSeries(course.courseInstanceDB, function(courseInstance, courseInstanceShortName, callback) {
                async.series([
                    function(callback) {logger.info("Syncing " + courseInstanceShortName
                                                    + " courseInstance from git repository to database..."); callback(null);},
                    syncCourseStaff.sync.bind(null, course.courseInfo, courseInstance),
                    function(callback) {logger.info("Syncing " + courseInstanceShortName
                                                    + " assessments from git repository to database..."); callback(null);},
                    syncAssessments.sync.bind(null, course.courseInfo, courseInstance),
                ], callback);
            }, function(err) {
                if (err) return callback(err);
                logger.info("Completed sync of git repository to database");
                callback(null);
            });
        });
    });
};
