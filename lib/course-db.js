var ERR = require('async-stacktrace');
var path = require('path');
var _ = require('lodash');
var fs = require('fs');
var async = require('async');
var moment = require("moment-timezone");
var child_process = require("child_process");
var jsonLoad = require('./json-load');
var config = require('./config');

module.exports = {};

module.exports.loadCourseInfo = function(courseInfo, courseDir, callback) {
    var that = this;
    var courseInfoFilename = path.join(courseDir, "courseInfo.json");
    jsonLoad.readInfoJSON(courseInfoFilename, "schemas/courseInfo.json", undefined, undefined, function(err, info) {
        if (ERR(err, callback)) return;
        courseInfo.path = courseDir;
        courseInfo.name = info.name;
        courseInfo.title = info.title;
        courseInfo.userRoles = info.userRoles;
        courseInfo.timezone = config.timezone;
        courseInfo.questionsDir = path.join(courseDir, "questions");
        courseInfo.courseInstancesDir = path.join(courseDir, "courseInstances");
        courseInfo.assessmentSets = info.assessmentSets;
        courseInfo.topics = info.topics;
        courseInfo.tags = info.tags;
        courseInfo.jsonFilename = info.jsonFilename;
        callback(null);
    });
};

var isValidDate = function(dateString) {
    return moment(dateString, "YYYY-MM-DDTHH:mm:ss", true).isValid();
}

module.exports.checkInfoValid = function(idName, info, infoFile, courseInfo, logger) {

    // check dates in allowAccess
    if (idName == "tid" && _(info).has('allowAccess')) {
        _(info.allowAccess).forEach(function(r) {
            if (r.startDate && !isValidDate(r.startDate)) {
                return new Error(infoFile + ': invalid "startDate": "' + r.startDate + '" (must be formatted as "YYYY-MM-DDTHH:mm:ss")');
            }
            if (r.endDate && !isValidDate(r.endDate)) {
                return new Error(infoFile + ': invalid "endDate": "' + r.endDate + '" (must be formatted as "YYYY-MM-DDTHH:mm:ss")');
            }
        });
    }

    var validAssessmentSets = _(courseInfo.assessmentSets).map('name');
    var validTopics = _(courseInfo.topics).map('name');
    var validTags = _(courseInfo.tags).map('name');
    
    // check assessments all have a valid assessmentSet
    if (idName == "tid") {
        if (courseInfo.assessmentSets && !_(validAssessmentSets).includes(info.set)) {
            return new Error(infoFile + ': invalid "set": "' + info.set + '" (must be a "name" of the "assessmentSets" listed in courseInfo.json)');
        }
    }

    // check all questions have valid topics and tags
    if (idName == "qid") {
        if (courseInfo.topics && !_(validTopics).includes(info.topic)) {
            return new Error(infoFile + ': invalid "topic": "' + info.topic + '" (must be a "name" of the "topics" listed in courseInfo.json)');
        }
        if (_(info).has('secondaryTopics')) {
            _(info.secondaryTopics).forEach(function(topic) {
                if (!_(validTopics).includes(topic)) {
                    return new Error(infoFile + ': invalid "secondaryTopics": "' + topic + '" (must be a "name" of the "topics" listed in courseInfo.json)');
                }
            });
        }
        if (_(info).has('tags')) {
            _(info.tags).forEach(function(tag) {
                if (courseInfo.tags && !_(validTags).includes(tag)) {
                    return new Error(infoFile + ': invalid "tags": "' + tag + '" (must be a "name" of the "tags" listed in courseInfo.json)');
                }
            });
        }
    }

    return null;
};

module.exports.loadInfoDB = function(db, idName, parentDir, infoFilename, defaultInfo, schemaFilename, optionSchemaPrefix, optionSchemaSuffix, courseInfo, logger, callback) {
    var that = this;
    fs.readdir(parentDir, function(err, files) {
        if (ERR(err, callback)) return;

        async.filter(files, function(dirName, callback) {
            // Filter out files from parentDir as it is possible they slip in without the user putting them there (like .DS_Store).
            var filePath = path.join(parentDir, dirName);
            fs.lstat(filePath, function(err, fileStats) {
                if (ERR(err, callback)) return;
                callback(null, fileStats.isDirectory());
            });
        }, function(err, folders) {
            if (ERR(err, callback)) return;
            async.each(folders, function(dir, callback) {
                var infoFile = path.join(parentDir, dir, infoFilename);
                jsonLoad.readInfoJSON(infoFile, schemaFilename, optionSchemaPrefix, optionSchemaSuffix, function(err, info) {
                    if (ERR(err, callback)) return;
                    info[idName] = dir;
                    err = that.checkInfoValid(idName, info, infoFile, courseInfo, logger);
                    if (ERR(err, callback)) return;
                    if (info.disabled) {
                        callback(null);
                        return;
                    }
                    info = _.defaults(info, defaultInfo);
                    db[dir] = info;
                    return callback(null);
                });
            }, function(err) {
                if (ERR(err, callback)) return;
                logger.debug("successfully loaded info from " + parentDir + ", number of items = " + _.size(db));
                callback(null);
            });
        });
    });
};

module.exports.loadFullCourse = function(courseDir, logger, callback) {
    var that = this;
    var course = {
        courseInfo: {},
        questionDB: {},
        courseInstanceDB: {},
    };
    var defaultQuestionInfo = {
        "type": "Calculation",
        "clientFiles": ["client.js", "question.html", "answer.html"],
    };
    var defaultCourseInstanceInfo = {};
    var defaultAssessmentInfo = {};
    async.series([
        that.loadCourseInfo.bind(that, course.courseInfo, courseDir),
        function(callback) {
            that.loadInfoDB(course.questionDB, "qid", course.courseInfo.questionsDir, "info.json", defaultQuestionInfo, "schemas/questionInfo.json", "schemas/questionOptions", ".json", course.courseInfo, logger, function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
        function(callback) {
            that.loadInfoDB(course.courseInstanceDB, "ciid", course.courseInfo.courseInstancesDir, "courseInstanceInfo.json", defaultCourseInstanceInfo, "schemas/courseInstanceInfo.json", null, null, course.courseInfo, logger, function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
    ], function(err) {
        if (ERR(err, callback)) return;
        async.forEachOf(course.courseInstanceDB, function(courseInstance, courseInstanceDir, callback) {
            var assessmentsDir = path.join(course.courseInfo.courseInstancesDir, courseInstanceDir, "assessments");
            courseInstance.assessmentDB = {};
            that.loadInfoDB(courseInstance.assessmentDB, "tid", assessmentsDir, "info.json", defaultAssessmentInfo, "schemas/assessmentInfo.json", "schemas/assessmentOptions", ".json", course.courseInfo, logger, function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        }, function(err) {
            if (ERR(err, callback)) return;
            callback(null, course);
        });
    });
};
