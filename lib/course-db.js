var ERR = require('async-stacktrace');
var path = require('path');
var _ = require('lodash');
var fs = require('fs');
var async = require('async');
var moment = require('moment');
var jsonLoad = require('./json-load');

var defaultAssessmentSets = [
    {'abbreviation': 'HW', 'name': 'Homework', 'heading': 'Homeworks', 'color': 'green1'},
    {'abbreviation': 'Q', 'name': 'Quiz', 'heading': 'Quizzes', 'color': 'red1'},
    {'abbreviation': 'PQ', 'name': 'Practice Quiz', 'heading': 'Practice Quizzes', 'color': 'pink1'},
    {'abbreviation': 'E', 'name': 'Exam', 'heading': 'Exams', 'color': 'brown1'},
    {'abbreviation': 'PE', 'name': 'Practice Exam', 'heading': 'Practice Exams', 'color': 'yellow1'},
    {'abbreviation': 'P', 'name': 'Prep', 'heading': 'Question Preparation', 'color': 'gray1'},
    {'abbreviation': 'MP', 'name': 'Machine Problem', 'heading': 'Machine Problems', 'color': 'turquoise1'},
];

var defaultTags = [
    {'name': 'numeric', 'color': 'brown1', 'description': 'The answer format is one or more numerical values.'},
    {'name': 'symbolic', 'color': 'blue1', 'description': 'The answer format is a symbolic expression.'},
    {'name': 'drawing', 'color': 'yellow1', 'description': 'The answer format requires drawing on a canvas to input a graphical representation of an answer.'},
    {'name': 'MC', 'color': 'green1', 'description': 'The answer format is choosing from a small finite set of answers (multiple choice, possibly with multiple selections allowed, up to 10 possible answers).'},
    {'name': 'code', 'color': 'turquoise1', 'description': 'The answer format is a piece of code.'},
    {'name': 'multianswer', 'color': 'orange2', 'description': 'The question requires multiple answers, either as steps in a sequence or as separate questions.'},
    {'name': 'graph', 'color': 'purple1', 'description': 'The question tests reading information from a graph or drawing a graph.'},
    {'name': 'concept', 'color': 'pink1', 'description': 'The question tests conceptual understanding of a topic.'},
    {'name': 'calculate', 'color': 'green2', 'description': 'The questions tests performing a numerical calculation, with either a calculator or equivalent software.'},
    {'name': 'compute', 'color': 'purple1', 'description': 'The question tests the writing and running of a piece of code to compute the answer. The answer itself is not the code, but could be a numeric answer output by the code, for example (use `code` when the answer is the code).'},
    {'name': 'software', 'color': 'orange1', 'description': 'The question tests the use of a specific piece of software (e.g., Matlab).'},
    {'name': 'estimation', 'color': 'red2', 'description': 'Answering the question correctly will require some amount of estimation, so an exact answer is not possible.'},
    {'name': 'secret', 'color': 'red3', 'description': 'Only use this question on exams or quizzes that won\'t be released to students, so the question can be kept secret.'},
    {'name': 'nontest', 'color': 'green3', 'description': 'This question is not appropriate for use in a restricted testing environment, so only use it on homeworks or similar.'},
    {'name': 'Sp15', 'color': 'gray1'},
    {'name': 'Su15', 'color': 'gray1'},
    {'name': 'Fa15', 'color': 'gray1'},
    {'name': 'Sp16', 'color': 'gray1'},
    {'name': 'Su16', 'color': 'gray1'},
    {'name': 'Fa16', 'color': 'gray1'},
    {'name': 'Sp17', 'color': 'gray1'},
    {'name': 'Su17', 'color': 'gray1'},
    {'name': 'Fa17', 'color': 'gray1'},
    {'name': 'Sp18', 'color': 'gray1'},
    {'name': 'Su18', 'color': 'gray1'},
    {'name': 'Fa18', 'color': 'gray1'},
];

module.exports = {};

module.exports.loadCourseInfo = function(courseInfo, courseDir, logger, callback) {
    var courseInfoFilename = path.join(courseDir, 'infoCourse.json');
    jsonLoad.readInfoJSON(courseInfoFilename, 'schemas/infoCourse.json', undefined, undefined, function(err, info) {
        if (ERR(err, callback)) return;
        courseInfo.uuid = info.uuid.toLowerCase();
        courseInfo.path = courseDir;
        courseInfo.name = info.name;
        courseInfo.title = info.title;
        courseInfo.timezone = info.timezone;
        courseInfo.userRoles = info.userRoles;
        courseInfo.questionsDir = path.join(courseDir, 'questions');
        courseInfo.courseInstancesDir = path.join(courseDir, 'courseInstances');
        courseInfo.topics = info.topics;
        courseInfo.assessmentSets = info.assessmentSets || [];
        _.each(defaultAssessmentSets, function(aset) {
            if (_.find(courseInfo.assessmentSets, ['name', aset.name])) {
                logger.warn('WARNING: Default assessmentSet "' + aset.name + '" should not be included in infoCourse.json');
            } else {
                courseInfo.assessmentSets.push(aset);
            }
        });
        courseInfo.tags = info.tags || [];
        _.each(defaultTags, function(tag) {
            if (_.find(courseInfo.tags, ['name', tag.name])) {
                logger.warn('WARNING: Default tag "' + tag.name + '" should not be included in infoCourse.json');
            } else {
                courseInfo.tags.push(tag);
            }
        });

        // Course options
        courseInfo.options = {};
        courseInfo.options.useNewQuestionRenderer = _.get(info, 'options.useNewQuestionRenderer', false);
        courseInfo.options.isExampleCourse = false;
        if (courseInfo.uuid == 'fcc5282c-a752-4146-9bd6-ee19aac53fc5'
            && courseInfo.title == 'Example Course'
            && courseInfo.name == 'XC 101') {
                courseInfo.options.isExampleCourse = true;
        }

        courseInfo.jsonFilename = info.jsonFilename;
        callback(null);
    });
};

module.exports.checkInfoValid = function(idName, info, infoFile, courseInfo, logger) {

    var validAssessmentSets = _(courseInfo.assessmentSets).map('name');
    var validTopics = _(courseInfo.topics).map('name');
    var validTags = _(courseInfo.tags).map('name');

    var myError = null;

    // check assessments all have a valid assessmentSet
    if (idName == 'tid') {
        if (courseInfo.assessmentSets && !_(validAssessmentSets).includes(info.set)) {
            return new Error(infoFile + ': invalid "set": "' + info.set + '" (must be a "name" of the "assessmentSets" listed in courseInfo.json)');
        }
        // check assessment access rules
        if (_(info).has('allowAccess')) {
            _(info.allowAccess).forEach(function(rule) {
                if ('startDate' in rule) {
                    var startDate = moment(rule.startDate, moment.ISO_8601);
                    if (startDate.isValid() == false) {
                        myError = new Error(`${infoFile}: invalid allowAccess startDate: ${rule.startDate}`);
                        return false;
                    }
                }
                if ('endDate' in rule) {
                    var endDate = moment(rule.endDate, moment.ISO_8601);
                    if (endDate.isValid() == false) {
                        myError = new Error(`${infoFile}: invalid allowAccess endDate: ${rule.startDate}`);
                        return false;
                    }
                }
                if ('startDate' in rule && 'endDate' in rule) {
                    if (startDate.isAfter(endDate)) {
                        myError = new Error(`${infoFile}: invalid allowAccess rule: startDate (${rule.startDate}) must not be after endDate (${rule.endDate})`);
                        return false;
                    }
                }
            });
        }
        if (myError) {
            return myError;
        }
    }

    // check all questions have valid topics and tags
    if (idName == 'qid') {
        if (courseInfo.topics && !_(validTopics).includes(info.topic)) {
            return new Error(infoFile + ': invalid "topic": "' + info.topic + '" (must be a "name" of the "topics" listed in courseInfo.json)');
        }
        if (_(info).has('secondaryTopics')) {
            _(info.secondaryTopics).forEach(function(topic) {
                if (!_(validTopics).includes(topic)) {
                    myError = new Error(infoFile + ': invalid "secondaryTopics": "' + topic + '" (must be a "name" of the "topics" listed in courseInfo.json)');
                    return false;
                }
            });
        }
        if (_(info).has('tags')) {
            _(info.tags).forEach(function(tag) {
                if (courseInfo.tags && !_(validTags).includes(tag)) {
                    myError = new Error(infoFile + ': invalid "tags": "' + tag + '" (must be a "name" of the "tags" listed in courseInfo.json)');
                    return false;
                }
            });
        }
        if (myError) {
            return myError;
        }
    }

    // checks for infoCourseInstance.json
    if (idName == 'ciid') {
        if (_(info).has('allowIssueReporting')) {
            if (info.allowIssueReporting) {
                logger.warn(`WARNING: ${infoFile}: "allowIssueReporting" is no longer needed.`);
            } else {
                return new Error(`${infoFile}: "allowIssueReporting" is no longer permitted in "infoCourseInstance.json". Instead, set "allowIssueReporting" in "infoAssessment.json" files.`);
            }
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
                    info.directory = dir;
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
                logger.debug('successfully loaded info from ' + parentDir + ', number of items = ' + _.size(db));
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
        'type': 'Calculation',
        'clientFiles': ['client.js', 'question.html', 'answer.html'],
    };
    var defaultCourseInstanceInfo = {};
    var defaultAssessmentInfo = {};
    async.series([
        that.loadCourseInfo.bind(that, course.courseInfo, courseDir, logger),
        function(callback) {
            that.loadInfoDB(course.questionDB, 'qid', course.courseInfo.questionsDir, 'info.json', defaultQuestionInfo, 'schemas/infoQuestion.json', 'schemas/questionOptions', '.json', course.courseInfo, logger, function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
        function(callback) {
            that.loadInfoDB(course.courseInstanceDB, 'ciid', course.courseInfo.courseInstancesDir, 'infoCourseInstance.json', defaultCourseInstanceInfo, 'schemas/infoCourseInstance.json', null, null, course.courseInfo, logger, function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
    ], function(err) {
        if (ERR(err, callback)) return;
        async.forEachOf(course.courseInstanceDB, function(courseInstance, courseInstanceDir, callback) {
            var assessmentsDir = path.join(course.courseInfo.courseInstancesDir, courseInstanceDir, 'assessments');
            courseInstance.assessmentDB = {};
            // Check that the assessments folder exists and is accessible before loading from it
            fs.lstat(assessmentsDir, function(err, stats) {
                if (err) {
                    // ENOENT: Directory does not exist
                    if (err.code == 'ENOENT') {
                        logger.warn(`Warning: ${courseInstanceDir} has no \`assessments\` directory (lstat error code ENOENT).`);

                    }
                    // Other access permissions error
                    else {
                        logger.warn(`Warning: \`${courseInstanceDir}/assessments\` is inaccessible (lstat error code ${err.code}).`);
                    }
                    // The above handles the error
                    callback(null);
                }
                // ENOTDIR: `assessments` is not a directory
                else if (!stats.isDirectory()) {
                    logger.warn(`Warning: \`${courseInstanceDir}/assessments\` is not a directory.`);
                    // This handles the error
                    callback(null);
                }
                else {
                    that.loadInfoDB(courseInstance.assessmentDB, 'tid', assessmentsDir, 'infoAssessment.json', defaultAssessmentInfo, 'schemas/infoAssessment.json', null, null, course.courseInfo, logger, function(err) {
                    if (ERR(err, callback)) return;
                    callback(null);
                    });
                }

            });
        }, function(err) {
            if (ERR(err, callback)) return;
            callback(null, course);
        });
    });
};
