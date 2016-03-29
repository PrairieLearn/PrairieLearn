var path = require('path');
var _ = require('underscore');
var fs = require('fs');
var async = require('async');
var moment = require("moment-timezone");
var jsonLoad = require('./jsonLoad');
var config = require('./config');
var logger = require('./logger');
var requireFrontend = require("./require-frontend");
var PrairieRole = requireFrontend("PrairieRole");

courseDB = {
    courseInfo: {},
    questionDB: {},
    testDB: {},
};

courseDB.getCourseOriginURL = function(callback) {
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

courseDB.loadCourseInfo = function(courseInfo, callback) {
    var courseInfoFilename = path.join(config.courseDir, "courseInfo.json");
    jsonLoad.readInfoJSON(courseInfoFilename, "schemas/courseInfo.json", undefined, undefined, function(err, info) {
        if (err) return callback(err);
        courseInfo.name = info.name;
        courseInfo.title = info.title;
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
        courseInfo.gitCourseBranch = config.gitCourseBranch;
        courseInfo.timezone = config.timezone;
        courseDB.getCourseOriginURL(function(err, originURL) {
            courseInfo.remoteFetchURL = originURL;
            return callback(null);
        });
    });
};

var isValidDate = function(dateString) {
    return moment(dateString, "YYYY-MM-DDTHH:mm:ss", true).isValid();
}

courseDB.checkInfoValid = function(idName, info, infoFile) {
    var retVal = true; // true means valid

    if (idName == "tid" && info.options && info.options.availDate) {
        logger.warn(infoFile + ': "options.availDate" is deprecated and will be removed in a future version. Instead, please use "allowAccess".');
    }

    // add semesters to tests without one
    if (idName == "tid" && !_(info).has("semester")) {
        if (courseDB.courseInfo.name == "TAM 212") {
            if (/^sp16_/.test(info.tid)) {
                info.semester = "Sp16";
            } else if (/^fa15_/.test(info.tid)) {
                info.semester = "Fa15";
            } else if (/^sp15_/.test(info.tid)) {
                info.semester = "Sp15";
            } else {
                info.semester = "Sp15";
            }
        } else {
            info.semester = config.semester;
        }
        logger.warn(infoFile + ': "semester" is missing, setting to "' + info.semester + '".');
    }

    // look for exams without credit assigned and patch it in to all access rules
    if (idName == "tid" && (info.type == "Exam" || info.type == "RetryExam")) {
        if (_(info).has('allowAccess') && !_(info.allowAccess).any(function(a) {return _(a).has('credit');})) {
            logger.warn(infoFile + ': No credit assigned in allowAccess rules, patching in credit = 100 to all rules. Please set "credit" in "allowAccess" rules explicitly.')
            _(info.allowAccess).each(function(a) {
                a.credit = 100;
            });
        }
    }

    // look for homeworks without a due date set and add an access rule with credit if possible
    if (idName == "tid" && _(info).has('options') && _(info.options).has('dueDate')) {
        logger.warn(infoFile + ': "options.dueDate" is deprecated and will be removed in a future version. Instead, please set "credit" in the "allowAccess" rules.');
        if (!_(info).has('allowAccess')) info.allowAccess = [];
        var hasStudentAccess = false, firstStartDate = null;
        _(info.allowAccess).each(function(a) {
            if ((!_(a).has('mode') || a.mode == 'Public') && (!_(a).has('role') || a.role == 'Student')) {
                hasStudentAccess = true;
                if (_(a).has('startDate')) {
                    if (firstStartDate == null || a.startDate < firstStartDate) {
                        firstStartDate = a.startDate;
                    }
                }
            }
        });
        if (hasStudentAccess) {
            var accessRule = {
                mode: 'Public',
                credit: 100,
            };
            if (firstStartDate) {
                accessRule.startDate = firstStartDate;
            }
            accessRule.endDate = info.options.dueDate;
            logger.warn(infoFile + ': Adding accessRule: ' + JSON.stringify(accessRule));
            info.allowAccess.push(accessRule);
        }
        delete info.options.dueDate;
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
    return retVal;
};

courseDB.loadInfoDB = function(db, idName, parentDir, defaultInfo, schemaFilename, optionSchemaPrefix, optionSchemaSuffix, loadCallback) {
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
                    if (!courseDB.checkInfoValid(idName, info, infoFile)) {
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

courseDB.load = function(callback) {
    async.series([
        function(callback) {
            courseDB.loadCourseInfo(courseDB.courseInfo, callback);
        },
        function(callback) {
            _(courseDB.questionDB).mapObject(function(val, key) {delete courseDB.questionDB[key];});
            var defaultQuestionInfo = {
                "type": "Calculation",
                "clientFiles": ["client.js", "question.html", "answer.html"],
            };
            courseDB.loadInfoDB(courseDB.questionDB, "qid", config.questionsDir, defaultQuestionInfo, "schemas/questionInfo.json", "schemas/questionOptions", ".json", callback);
        },
        function(callback) {
            _(courseDB.testDB).mapObject(function(val, key) {delete courseDB.testDB[key];});
            var defaultTestInfo = {
            };
            courseDB.loadInfoDB(courseDB.testDB, "tid", config.testsDir, defaultTestInfo, "schemas/testInfo.json", "schemas/testOptions", ".json", callback);
        },
    ], callback);
};

module.exports = courseDB;
