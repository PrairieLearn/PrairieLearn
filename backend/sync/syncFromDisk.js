var async = require('async');

var logger = require('../logger');
var courseDB = require('../course-db');

var syncCourseInfo = require('./fromDisk/courseInfo');
var syncCourseInstances = require('./fromDisk/courseInstances');
var syncCourseStaff = require('./fromDisk/courseStaff');
var syncTopics = require('./fromDisk/topics');
var syncQuestions = require('./fromDisk/questions');
var syncTestSets = require('./fromDisk/testSets');
var syncTests = require('./fromDisk/tests');

module.exports = {};

module.exports.syncDiskToSql = function(courseDir, callback) {
    logger.infoOverride("Starting sync of disk to SQL DB for " + courseDir);
    courseDB.loadFullCourse(courseDir, function(err, course) {
        if (err) return callback(err);
        logger.infoOverride("Starting sync of disk to SQL");
        async.series([
            function(callback) {logger.infoOverride("Syncing courseInfo from disk to SQL DB"); callback(null);},
            syncCourseInfo.sync.bind(null, course.courseInfo),
            function(callback) {logger.infoOverride("Syncing courseInstances from disk to SQL DB"); callback(null);},
            syncCourseInstances.sync.bind(null, course.courseInfo, course.courseInstanceDB),
            function(callback) {logger.infoOverride("Syncing topics from disk to SQL DB"); callback(null);},
            syncTopics.sync.bind(null, course.courseInfo),
            function(callback) {logger.infoOverride("Syncing questions from disk to SQL DB"); callback(null);},
            syncQuestions.sync.bind(null, course.courseInfo, course.questionDB),
            function(callback) {logger.infoOverride("Syncing test sets from disk to SQL DB"); callback(null);},
            syncTestSets.sync.bind(null, course.courseInfo),
        ], function(err) {
            if (err) return callback(err);
            async.forEachOfSeries(course.courseInstanceDB, function(courseInstance, courseInstanceShortName, callback) {
                async.series([
                    function(callback) {logger.infoOverride("Syncing courseInstance " + courseInstanceShortName
                                                            + " from disk to SQL DB"); callback(null);},
                    function(callback) {logger.infoOverride("Syncing courseStaff from disk to SQL DB"); callback(null);},
                    syncCourseStaff.sync.bind(null, course.courseInfo, courseInstance),
                    function(callback) {logger.infoOverride("Syncing tests from disk to SQL DB"); callback(null);},
                    syncTests.sync.bind(null, course.courseInfo, courseInstance),
                ], callback);
            }, function(err) {
                if (err) return callback(err);
                logger.infoOverride("Completed sync of disk to SQL");
                callback(null);
            });
        });
    });
};
