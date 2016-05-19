var path = require('path');
var _ = require('underscore');
var fs = require('fs');
var async = require('async');
var moment = require("moment-timezone");
var child_process = require("child_process");
var jsonLoad = require('./json-load');
var config = require('./config');
var logger = require('./logger');
var requireFrontend = require("./require-frontend");
var PrairieRole = requireFrontend("PrairieRole");

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
        if (err) return callback(err);
        var originURL = null;
        _(stdout.split('\n')).each(function(line) {
            match = /^ *Fetch URL: (.*)$/.exec(line);
            if (!match) return;
            originURL = match[1];
        });
        if (!originURL) {
            return callback(Error('Invalid or missing "Fetch URL" from "git show"'),
                            {cmd: cmd, options: options, env: env, stdout: stdout});
        }
        callback(null, originURL);
    });
};

module.exports.loadCourseInfo = function(courseInfo, callback) {
    var that = this;
    var courseInfoFilename = path.join(config.courseDir, "courseInfo.json");
    jsonLoad.readInfoJSON(courseInfoFilename, "schemas/courseInfo.json", undefined, undefined, function(err, info) {
        if (err) return callback(err);
        courseInfo.name = info.name;
        courseInfo.title = info.title;
        courseInfo.gitCourseBranch = config.gitCourseBranch;
        courseInfo.timezone = config.timezone;
        courseInfo.currentCourseInstance = info.currentCourseInstance;
        courseInfo.testsDir = path.join(config.courseDir, "courseInstances", info.currentCourseInstance, "tests");
        courseInfo.testSets = info.testSets;
        courseInfo.topics = info.topics;
        courseInfo.tags = info.tags;
        that.getCourseOriginURL(function(err, originURL) {
            courseInfo.remoteFetchURL = originURL;
            return callback(null);
        });
    });
};

module.exports.loadCourseInstanceInfo = function(courseInfo, callback) {
    var that = this;
    var courseInfoFilename = path.join(config.courseDir, "courseInstances", courseInfo.currentCourseInstance, "courseInstanceInfo.json");
    jsonLoad.readInfoJSON(courseInfoFilename, "schemas/courseInstanceInfo.json", undefined, undefined, function(err, info) {
        if (err) return callback(err);
        courseInfo.courseInstanceShortName = info.shortName;
        courseInfo.courseInstanceLongName = info.longName;
        if (info.userRoles) {
            _(info.userRoles).forEach(function(value, key) {
                if (!PrairieRole.isRoleValid(value)) {
                    logger.warn("Invalid role '" + value + "' in courseInfo.json; ignoring.");
                    return;
                }
                // Don't allow adding or removing superusers
                if (config.roles[key] === 'Superuser' || value === 'Superuser') {
                    return;
                }
                config.roles[key] = value;
            });
        }
        courseInfo.userRoles = info.userRoles;
        return callback(null);
    });
};

var isValidDate = function(dateString) {
    return moment(dateString, "YYYY-MM-DDTHH:mm:ss", true).isValid();
}

module.exports.checkInfoValid = function(idName, info, infoFile) {
    var that = this;
    var retVal = true; // true means valid

    // availDate is deprecated
    if (idName == "tid" && info.options && info.options.availDate) {
        logger.error(infoFile + ': "options.availDate" is deprecated. Instead, please use "allowAccess".');
        retVal = false;
    }

    // add semester to tests
    if (idName == "tid") {
        info.semester = that.courseInfo.currentSemester;
    }

    // look for exams without credit assigned and warn about it
    if (idName == "tid" && (info.type == "Exam" || info.type == "RetryExam")) {
        if (_(info).has('allowAccess') && !_(info.allowAccess).any(function(a) {return _(a).has('credit');})) {
            logger.warn(infoFile + ': No credit assigned in any allowAccess rules.')
        }
    }

    // due date is deprecated
    if (idName == "tid" && _(info).has('options') && _(info.options).has('dueDate')) {
        logger.error(infoFile + ': "options.dueDate" is deprecated.');
        retVal = false;
    }

    // check dates in allowAccess
    if (idName == "tid" && _(info).has('allowAccess')) {
        _(info.allowAccess).each(function(r) {
            if (r.startDate && !isValidDate(r.startDate)) {
                logger.error(infoFile + ': invalid "startDate": "' + r.startDate + '" (must be formatted as "YYYY-MM-DDTHH:mm:ss")');
                revVal = false;
            }
            if (r.endDate && !isValidDate(r.endDate)) {
                logger.error(infoFile + ': invalid "endDate": "' + r.endDate + '" (must be formatted as "YYYY-MM-DDTHH:mm:ss")');
                revVal = false;
            }
        });
    }

    var validTestSets = _(that.courseInfo.testSets).pluck('name');
    var validTopics = _(that.courseInfo.topics).pluck('name');
    var validTags = _(that.courseInfo.tags).pluck('name');
    
    // check tests all have a valid testSet
    if (idName == "tid") {
        if (!_(validTestSets).contains(info.set)) {
            logger.error(infoFile + ': invalid "set": "' + info.set + '" (must be a "name" of the "testSets" listed in courseInfo.json)');
            retVal = false;
        }
    }

    // check all questions have valid topics and tags
    if (idName == "qid") {
        if (!_(validTopics).contains(info.topic)) {
            logger.error(infoFile + ': invalid "topic": "' + info.topic + '" (must be a "name" of the "topics" listed in courseInfo.json)');
            retVal = false;
        }
        if (_(info).has('secondaryTopics')) {
            _(info.secondaryTopics).each(function(topic) {
                if (!_(validTopics).contains(topic)) {
                    logger.error(infoFile + ': invalid "secondaryTopics": "' + topic + '" (must be a "name" of the "topics" listed in courseInfo.json)');
                    retVal = false;
                }
            });
        }
        if (_(info).has('tags')) {
            _(info.tags).each(function(tag) {
                if (!_(validTags).contains(tag)) {
                    logger.error(infoFile + ': invalid "tags": "' + tag + '" (must be a "name" of the "tags" listed in courseInfo.json)');
                    retVal = false;
                }
            });
        }
    }
    
    return retVal;
};

module.exports.loadInfoDB = function(db, idName, parentDir, defaultInfo, schemaFilename, optionSchemaPrefix, optionSchemaSuffix, loadCallback) {
    var that = this;
    fs.readdir(parentDir, function(err, files) {
        if (err) {
            logger.error("unable to read info directory: " + parentDir, err);
            loadCallback(true);
            return;
        }

        async.filter(files, function(dirName, cb) {
            // Filter out files from questions/ as it is possible they slip in without the user putting them there (like .DS_Store).
            var filePath = path.join(parentDir, dirName);
            fs.lstat(filePath, function(err, fileStats){
                cb(fileStats.isDirectory());
            });
        }, function(folders) {
            async.each(folders, function(dir, callback) {
                var infoFile = path.join(parentDir, dir, "info.json");
                jsonLoad.readInfoJSON(infoFile, schemaFilename, optionSchemaPrefix, optionSchemaSuffix, function(err, info) {
                    if (err) {
                        logger.error("Error reading file: " + infoFile, err);
                        callback(null);
                        return;
                    }
                    info[idName] = dir;
                    if (!that.checkInfoValid(idName, info, infoFile)) {
                        callback(null);
                        return;
                    }
                    if (info.disabled) {
                        callback(null);
                        return;
                    }
                    info = _.defaults(info, defaultInfo);
                    db[dir] = info;
                    return callback(null);
                });
            }, function(err) {
                if (err) {
                    logger.error("Error reading data", err);
                    loadCallback(err);
                    return;
                }
                logger.info("successfully loaded info from " + parentDir + ", number of items = " + _.size(db));
                loadCallback();
            });
        });
    });
};

module.exports.load = function(callback) {
    var that = this;
    async.series([
        function(callback) {
            that.loadCourseInfo(that.courseInfo, callback);
        },
        function(callback) {
            that.loadCourseInstanceInfo(that.courseInfo, callback);
        },
        function(callback) {
            _(that.questionDB).mapObject(function(val, key) {delete that.questionDB[key];});
            var defaultQuestionInfo = {
                "type": "Calculation",
                "clientFiles": ["client.js", "question.html", "answer.html"],
            };
            that.loadInfoDB(that.questionDB, "qid", config.questionsDir, defaultQuestionInfo, "schemas/questionInfo.json", "schemas/questionOptions", ".json", callback);
        },
        function(callback) {
            _(that.testDB).mapObject(function(val, key) {delete that.testDB[key];});
            var defaultTestInfo = {
            };
            that.loadInfoDB(that.testDB, "tid", that.courseInfo.testsDir, defaultTestInfo, "schemas/testInfo.json", "schemas/testOptions", ".json", callback);
        },
    ], callback);
};
