var ERR = require('async-stacktrace');
var path = require('path');
var _ = require('lodash');
var fs = require('fs');
var async = require('async');
var moment = require("moment-timezone");
var child_process = require("child_process");
var jsonLoad = require('./json-load');
var config = require('./config');

module.exports = {
    courseInfo: {},
    questionDB: {},
    testDB: {},
};

module.exports.getCourseOriginURL = function(callback) {
    if (!config.gitCourseBranch) return callback(null, null);
    var cmd = 'git';
    var options = ['remote', 'show', '-n', 'origin'];
    var env = {
        'timeout': 5000, // milliseconds
        'cwd': config.courseDir,
    };
    child_process.execFile(cmd, options, env, function(err, stdout, stderr) {
        if (ERR(err, callback)) return;
        var originURL = null;
        _(stdout.split('\n')).forEach(function(line) {
            match = /^ *Fetch URL: (.*)$/.exec(line);
            if (!match) return;
            originURL = match[1];
        });
        if (!originURL) {
            return callback(new Error('Invalid or missing "Fetch URL" from "git show"'),
                            {cmd: cmd, options: options, env: env, stdout: stdout});
        }
        callback(null, originURL);
    });
};

module.exports.loadCourseInfo = function(courseInfo, courseDir, callback) {
    var that = this;
    var courseInfoFilename = path.join(courseDir, "courseInfo.json");
    jsonLoad.readInfoJSON(courseInfoFilename, "schemas/courseInfo.json", undefined, undefined, function(err, info) {
        if (ERR(err, callback)) return;
        courseInfo.path = courseDir;
        courseInfo.name = info.name;
        courseInfo.title = info.title;
        if (info.userRoles) {
            _(info.userRoles).forEach(function(value, key) {
                // Don't allow adding or removing superusers
                if (config.roles[key] === 'Superuser' || value === 'Superuser') {
                    return;
                }
                config.roles[key] = value;
            });
        }
        courseInfo.userRoles = info.userRoles;
        courseInfo.gitCourseBranch = config.gitCourseBranch;
        courseInfo.timezone = config.timezone;
        courseInfo.currentCourseInstance = info.currentCourseInstance;
        courseInfo.questionsDir = path.join(courseDir, "questions");
        courseInfo.courseInstancesDir = path.join(courseDir, "courseInstances");
        courseInfo.testsDir = path.join(courseDir, "tests");
        courseInfo.assessmentSets = info.assessmentSets;
        courseInfo.topics = info.topics;
        courseInfo.tags = info.tags;
        that.getCourseOriginURL(function(err, originURL) {
            if (ERR(err, callback)) return;
            courseInfo.remoteFetchURL = originURL;
            callback(null);
        });
    });
};

var isValidDate = function(dateString) {
    return moment(dateString, "YYYY-MM-DDTHH:mm:ss", true).isValid();
}

module.exports.checkInfoValid = function(idName, info, infoFile, courseInfo, logger) {

    // availDate is deprecated
    if (idName == "tid" && info.options && info.options.availDate) {
        logger.warn(infoFile + ': "options.availDate" is deprecated and will be removed in a future version. Instead, please use "allowAccess".');
    }

    // look for exams without credit assigned and warn about it
    if (idName == "tid" && (info.type == "Exam" || info.type == "RetryExam")) {
        if (_(info).has('allowAccess') && !_(info.allowAccess).some(function(a) {return _(a).has('credit');})) {
            logger.warn(infoFile + ': No credit assigned in any allowAccess rules.')
        }
    }

    // due date is deprecated
    if (idName == "tid" && _(info).has('options') && _(info.options).has('dueDate')) {
        logger.warn(infoFile + ': "options.dueDate" is deprecated. Use "allowAccess" instead.');
    }

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

    if (idName == 'tid') {
        if (info.type == 'OldExam') {
            info.type = 'Exam';
            info.questionGroups = _.map(info.qidGroups, function(g1) {
                return _.map(g1, function(g2) {
                    return _.map(g2, function(q) {
                        return {qid: q, points: [1]};
                    });
                });
            });
            delete info.qidGroups;
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
            fs.lstat(filePath, function(err, fileStats){
                if (err) return callback(false); // no eror handling for async.filter
                callback(fileStats.isDirectory());
            });
        }, function(folders) {
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

module.exports.load = function(logger, callback) {
    var that = this;
    async.series([
        function(callback) {
            that.loadCourseInfo(that.courseInfo, config.courseDir, callback);
        },
        function(callback) {
            _(that.questionDB).forOwn(function(val, key) {delete that.questionDB[key];});
            var defaultQuestionInfo = {
                "type": "Calculation",
                "clientFiles": ["client.js", "question.html", "answer.html"],
            };
            that.loadInfoDB(that.questionDB, "qid", config.questionsDir, "info.json", defaultQuestionInfo,
                            "schemas/questionInfo.json", "schemas/questionOptions", ".json", that.courseInfo, logger, callback);
        },
        function(callback) {
            _(that.testDB).forOwn(function(val, key) {delete that.testDB[key];});
            var defaultTestInfo = {
            };
            that.loadInfoDB(that.testDB, "tid", that.courseInfo.testsDir, "info.json", defaultTestInfo,
                            "schemas/testInfo.json", "schemas/testOptions", ".json", that.courseInfo, logger, callback);
        },
    ], callback);
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
            // FIXME: rename 'test' -> 'assessment" on the line below once the mongo server is gone
            that.loadInfoDB(courseInstance.assessmentDB, "tid", assessmentsDir, "info.json", defaultAssessmentInfo, "schemas/testInfo.json", "schemas/testOptions", ".json", course.courseInfo, logger, function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        }, function(err) {
            if (ERR(err, callback)) return;
            callback(null, course);
        });
    });
};
