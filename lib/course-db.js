const ERR = require('async-stacktrace');
const path = require('path');
const _ = require('lodash');
const fs = require('fs');
const async = require('async');
const moment = require('moment');
const schemas = require('../schemas');

const jsonLoad = require('./json-load');

var defaultAssessmentSets = [
    {'abbreviation': 'HW', 'name': 'Homework', 'heading': 'Homeworks', 'color': 'green1'},
    {'abbreviation': 'Q', 'name': 'Quiz', 'heading': 'Quizzes', 'color': 'red1'},
    {'abbreviation': 'PQ', 'name': 'Practice Quiz', 'heading': 'Practice Quizzes', 'color': 'pink1'},
    {'abbreviation': 'E', 'name': 'Exam', 'heading': 'Exams', 'color': 'brown1'},
    {'abbreviation': 'PE', 'name': 'Practice Exam', 'heading': 'Practice Exams', 'color': 'yellow1'},
    {'abbreviation': 'P', 'name': 'Prep', 'heading': 'Question Preparation', 'color': 'gray1'},
    {'abbreviation': 'MP', 'name': 'Machine Problem', 'heading': 'Machine Problems', 'color': 'turquoise1'},
    {'abbreviation': 'WS', 'name': 'Worksheet', 'heading': 'Worksheets', 'color': 'purple1'},
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
    {'name': 'Sp19', 'color': 'gray1'},
    {'name': 'Su19', 'color': 'gray1'},
    {'name': 'Fa19', 'color': 'gray1'},
    {'name': 'Sp20', 'color': 'gray1'},
    {'name': 'Su20', 'color': 'gray1'},
    {'name': 'Fa20', 'color': 'gray1'},
    {'name': 'Sp21', 'color': 'gray1'},
    {'name': 'Su21', 'color': 'gray1'},
    {'name': 'Fa21', 'color': 'gray1'},
];

function loadCourseInfo(courseInfo, courseDir, logger, callback) {
    var courseInfoFilename = path.join(courseDir, 'infoCourse.json');
    jsonLoad.readInfoJSON(courseInfoFilename, schemas.infoCourse, function(err, info) {
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
        courseInfo.exampleCourse = false;
        if (courseInfo.uuid == 'fcc5282c-a752-4146-9bd6-ee19aac53fc5'
            && courseInfo.title == 'Example Course'
            && courseInfo.name == 'XC 101') {
                courseInfo.exampleCourse = true;
        }

        courseInfo.jsonFilename = info.jsonFilename;
        callback(null);
    });
}

function checkInfoValid(idName, info, infoFile, courseInfo, logger, cache) {
    var myError = null;

    // check assessments all have a valid assessmentSet
    if (idName == 'tid') {
        let { validAssessmentSets } = cache;
        if (!validAssessmentSets) {
            validAssessmentSets = new Set(courseInfo.assessmentSets.map(as => as.name));
            cache.validAssessmentSets = validAssessmentSets;
        }
        if (courseInfo.assessmentSets && !validAssessmentSets.has(info.set)) {
            return new Error(infoFile + ': invalid "set": "' + info.set + '" (must be a "name" of the "assessmentSets" listed in infoCourse.json)');
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
}

function loadInfoDB(db, idName, parentDir, infoFilename, defaultInfo, schema, optionSchemaPrefix, courseInfo, logger, callback) {
    // `cache` is an object with which we can cache information derived from course info
    // in between successive calls to `checkInfoValid`
    const cache = {};

    let walk = function(relativeDir, callback) {
        fs.readdir(path.join(parentDir, relativeDir), function(err, files) {
            if (ERR(err, callback)) return;

            async.map(files, function(dir, callback) {
                var infoFile = path.join(parentDir, relativeDir, dir, infoFilename);
                jsonLoad.readInfoJSON(infoFile, schema, function(err, info) {
                    if (err && err.code && err.path && (err.code === 'ENOTDIR') && err.path === infoFile) {
                        // In a previous version of this code, we'd pre-filter
                        // all files in the parent directory to remove anything
                        // that may have accidentally slipped in, like .DS_Store.
                        // However, that resulted in a huge number of system calls
                        // that got really slow for large directories. Now, we'll
                        // just blindly try to read a file from the directory and assume
                        // that if we see ENOTDIR, that means the directory was not
                        // in fact a directory.
                        callback(null, 0);
                        return;
                    }
                    if (err && err.code && (err.code == 'ENOENT') && err.path === infoFile) {
                        /* Try to recurse into the directory if we don't find an info json file. */
                        walk(path.join(relativeDir, dir), function(walk_err, num_loaded) {
                            if (ERR(walk_err, callback)) return;
                            if (num_loaded == 0) {
                                /* We didn't actually find any children, so just pass along the error. */
                                callback(err, 0);
                            } else {
                                callback(null, num_loaded);
                            }
                        });
                        return;
                    }
                    if (ERR(err, callback)) return;
                    jsonLoad.validateOptions(info, infoFile, optionSchemaPrefix, schemas, function(err, info) {
                        if (ERR(err, callback)) return;
                        info[idName] = path.join(relativeDir, dir);
                        info.directory = path.join(relativeDir, dir);

                        err = checkInfoValid(idName, info, infoFile, courseInfo, logger, cache);
                        if (ERR(err, callback)) return;
                        if (info.disabled) {
                            return callback(null, 0);
                        }

                        info = _.defaults(info, defaultInfo);
                        db[path.join(relativeDir, dir)] = info;
                        return callback(null, 1);
                    });
                });
            }, function(err, results) {
                if (ERR(err, callback)) return;
                let loaded_vals = results.reduce((x, y) => x + y, 0);
                callback(null, loaded_vals);
            });
        });
    };

    return walk('', function(err, num_loaded) {
        if (ERR(err, callback)) return;
        logger.debug('successfully loaded info from ' + parentDir + ', number of items = ' + num_loaded);
        callback(err);
    });
}

module.exports.loadFullCourse = function(courseDir, logger, callback) {
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
        loadCourseInfo.bind(null, course.courseInfo, courseDir, logger),
        function(callback) {
            course.questionDB = {};
            // Check that the questions folder exists and is accessible before loading from it
            fs.lstat(course.courseInfo.questionsDir, function(err, stats) {
                if (err) {
                    // ENOENT: Directory does not exist
                    if (err.code == 'ENOENT') {
                        logger.warn(`Warning: ${courseDir} has no \`questions\` directory (lstat error code ENOENT).`);
                    }
                    // Other access permissions error
                    else {
                        logger.warn(`Warning: \`${courseDir}/questions\` is inaccessible (lstat error code ${err.code}).`);
                    }
                    // The above handles the error
                    callback(null);
                }
                // ENOTDIR: `questions` is not a directory
                else if (!stats.isDirectory()) {
                    logger.warn(`Warning: \`${courseDir}/questions\` is not a directory.`);
                    // This handles the error
                    callback(null);
                }
                else {
                    loadInfoDB(course.questionDB, 'qid', course.courseInfo.questionsDir, 'info.json', defaultQuestionInfo, schemas.infoQuestion, 'questionOptions', course.courseInfo, logger, function(err) {
                        if (ERR(err, callback)) return;
                        callback(null);
                    });
                }

            });
        },
        function(callback) {
            course.courseInstanceDB = {};
            // Check that the courseInstances folder exists and is accessible before loading from it
            fs.lstat(course.courseInfo.courseInstancesDir, function(err, stats) {
                if (err) {
                    // ENOENT: Directory does not exist
                    if (err.code == 'ENOENT') {
                        logger.warn(`Warning: ${courseDir} has no \`courseInstances\` directory (lstat error code ENOENT).`);
                    }
                    // Other access permissions error
                    else {
                        logger.warn(`Warning: \`${courseDir}/courseInstances\` is inaccessible (lstat error code ${err.code}).`);
                    }
                    // The above handles the error
                    callback(null);
                }
                // ENOTDIR: `questions` is not a directory
                else if (!stats.isDirectory()) {
                    logger.warn(`Warning: \`${courseDir}/courseInstances\` is not a directory.`);
                    // This handles the error
                    callback(null);
                }
                else {
                    loadInfoDB(course.courseInstanceDB, 'ciid', course.courseInfo.courseInstancesDir, 'infoCourseInstance.json', defaultCourseInstanceInfo, schemas.infoCourseInstance, null, course.courseInfo, logger, function(err) {
                        if (ERR(err, callback)) return;
                        callback(null);
                    });
                }
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
                    loadInfoDB(courseInstance.assessmentDB, 'tid', assessmentsDir, 'infoAssessment.json', defaultAssessmentInfo, schemas.infoAssessment, null, course.courseInfo, logger, function(err) {
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
