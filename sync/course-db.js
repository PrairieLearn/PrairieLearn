// @ts-check
const ERR = require('async-stacktrace');
const path = require('path');
const _ = require('lodash');
const fs = require('fs-extra');
const util = require('util');
const async = require('async');
const moment = require('moment');
const schemas = require('../schemas');
const either = require('./either');

const jsonLoad = require('../lib/json-load');

const DEFAULT_QUESTION_INFO = {
    type: 'Calculation',
    clientFiles: ['client.js', 'question.html', 'answer.html'],
};
const DEFAULT_COURSE_INSTANCE_INFO = {};
const DEFAULT_ASSESSMENT_INFO = {};

const DEFAULT_ASSESSMENT_SETS = [
    {'abbreviation': 'HW', 'name': 'Homework', 'heading': 'Homeworks', 'color': 'green1'},
    {'abbreviation': 'Q', 'name': 'Quiz', 'heading': 'Quizzes', 'color': 'red1'},
    {'abbreviation': 'PQ', 'name': 'Practice Quiz', 'heading': 'Practice Quizzes', 'color': 'pink1'},
    {'abbreviation': 'E', 'name': 'Exam', 'heading': 'Exams', 'color': 'brown1'},
    {'abbreviation': 'PE', 'name': 'Practice Exam', 'heading': 'Practice Exams', 'color': 'yellow1'},
    {'abbreviation': 'P', 'name': 'Prep', 'heading': 'Question Preparation', 'color': 'gray1'},
    {'abbreviation': 'MP', 'name': 'Machine Problem', 'heading': 'Machine Problems', 'color': 'turquoise1'},
];

const DEFAULT_TAGS = [
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

/**
 * 
 * @param {*} idName 
 * @param {*} info 
 * @param {*} infoFile 
 * @returns {{ errors: string[], warnings: string[] }}
 */
function checkInfoValid(idName, info, infoFile) {
    const errors = [];
    const warnings = [];

    // check assessments all have a valid assessmentSet
    if (idName == 'tid') {
        // TODO: we previously validated that all assessment sets listed in assessments
        // were also present in infoCourse.json. I removed that check for now, but we
        // still need to treat assessment sets like we do topics and tags and create them
        // on the fly for courses
        // check assessment access rules
        if (_(info).has('allowAccess')) {
            _(info.allowAccess).forEach(function(rule) {
                let startDate, endDate;
                if ('startDate' in rule) {
                    startDate = moment(rule.startDate, moment.ISO_8601);
                    if (startDate.isValid() == false) {
                        errors.push(`${infoFile}: invalid allowAccess startDate: ${rule.startDate}`);
                    }
                }
                if ('endDate' in rule) {
                    endDate = moment(rule.endDate, moment.ISO_8601);
                    if (endDate.isValid() == false) {
                        errors.push(`${infoFile}: invalid allowAccess endDate: ${rule.startDate}`);
                    }
                }
                if (startDate && endDate && startDate.isAfter(endDate)) {
                    errors.push(`${infoFile}: invalid allowAccess rule: startDate (${rule.startDate}) must not be after endDate (${rule.endDate})`);
                }
            });
        }
    }

    // checks for infoCourseInstance.json
    if (idName == 'ciid') {
        if (_(info).has('allowIssueReporting')) {
            if (info.allowIssueReporting) {
                warnings.push(`"allowIssueReporting" is no longer needed.`);
            } else {
                errors.push(`${infoFile}: "allowIssueReporting" is no longer permitted in "infoCourseInstance.json". Instead, set "allowIssueReporting" in "infoAssessment.json" files.`);
            }
        }
    }

    return {
        errors,
        warnings,
    };
}

async function loadAndValidateJson(id, idName, jsonPath, defaults, schema, optionSchemaPrefix) {
    let json;
    try {
        json = await jsonLoad.readInfoJSONAsync(jsonPath, schema);
    } catch (err) {
        if (err && err.code && err.path && (err.code === 'ENOTDIR') && err.path === jsonPath) {
            // In a previous version of this code, we'd pre-filter
            // all files in the parent directory to remove anything
            // that may have accidentally slipped in, like .DS_Store.
            // However, that resulted in a huge number of system calls
            // that got really slow for large directories. Now, we'll
            // just blindly try to read a file from the directory and assume
            // that if we see ENOTDIR, that means the directory was not
            // in fact a directory.
            return undefined;
        }
        // This is another error, possibly validation-related. Just re-throw it.
        throw err;
    }

    await jsonLoad.validateOptionsAsync(json, jsonPath, optionSchemaPrefix, schemas);
    json[idName] = id;
    const optionsError = checkInfoValid(idName, json, jsonPath);
    if (optionsError) throw optionsError;

    return _.defaults(json, defaults);
}

/**
 * @param {string} courseDir The directory of the course
 * @param {string} qid The QID of the question to load
 */
module.exports.loadSingleQuestion = async function(courseDir, qid) {
    const infoQuestionPath = path.join(courseDir, 'questions', qid, 'info.json');
    return await loadAndValidateJson(qid, 'qid', infoQuestionPath, DEFAULT_QUESTION_INFO, schemas.infoQuestion, 'questionOptions');
};

module.exports.loadFullCourse = function(courseDir, logger, callback) {
    util.callbackify(this.loadFullCourseNew)(courseDir, (err, courseData) => {
        if (ERR(err, callback)) return;

        // First, scan through everything to check for errors, and if we find one, "throw" it
        if (either.hasErrors(courseData.course)) {
            return callback(new Error(either.stringifyErrors(courseData.course)));
        }
        for (const qid in courseData.questions) {
            if (either.hasErrors(courseData.questions[qid])) {
                return callback(new Error(either.stringifyErrors(courseData.questions[qid])));
            }
        }
        for (const ciid in courseData.courseInstances) {
            if (either.hasErrors(courseData.courseInstances[ciid].courseInstance)) {
                return callback(new Error(either.stringifyErrors(courseData.courseInstances[ciid].courseInstance)));
            }
        }
        for (const ciid in courseData.courseInstances) {
            const courseInstance = courseData.courseInstances[ciid];
            for (const tid in courseInstance.assessments) {
                if (either.hasErrors(courseInstance.assessments[tid])) {
                    return callback(new Error(either.stringifyErrors(courseInstance.assessments[tid])));
                }
            }
        }

        const questions = {};
        Object.entries(courseData.questions).forEach(([qid, question]) => questions[qid] = question.data);

        const courseInstances = {};
        Object.entries(courseData.courseInstances).forEach(([ciid, courseInstance]) => {
            const assessments = {};
            Object.entries(courseInstance.assessments).forEach(([tid, assessment]) => {
                assessments[tid] = assessment.data;
            });
            courseInstances[ciid] = {
                ...courseInstance.courseInstance.data,
                assessmentDB: assessments,
            };
        });

        const course = {
            courseInfo: courseData.course.data,
            questionDB: questions,
            courseInstanceDB: courseInstances,
        };
        callback(null, course);
    });
};

/**
 * @template T
 * @typedef {object} Either Contains either an error or data; data may include warnings.
 * @property {string[]} [errors]
 * @property {string[]} [warnings]
 * @property {T} [data]
 */

/**
 * @typedef {Object} CourseOptions
 * @property {boolean} useNewQuestionRenderer
 * @property {boolean} isExampleCourse
 */

/**
 * @typedef {Object} Tag
 * @property {string} name
 * @property {string} color
 * @property {string} [description]
 */

/**
 * @typedef {Object} Topic
 * @property {string} name
 * @property {string} color
 * @property {string} description
 */

/**
 * @typedef {Object} AssessmentSet
 * @property {string} abbreviation
 * @property {string} name
 * @property {string} heading
 * @property {string} color
 */

/** 
 * @typedef {Object} Course
 * @property {string} uuid
 * @property {string} name
 * @property {string} title
 * @property {string} path
 * @property {string} timezone
 * @property {CourseOptions} options
 * @property {Tag[]} tags
 * @property {Topic[]} topics
 * @property {AssessmentSet[]} assessmentSets
 */

/** @typedef {"Student" | "TA" | "Instructor" | "Superuser"} UserRole */
/** @typedef {"UIUC" | "ZJUI" | "LTI" | "Any"} Institution */

/**
 * @typedef {Object} CourseInstanceAllowAccess
 * @property {UserRule} role
 * @property {string[]} uids
 * @property {string} startDate
 * @property {string} endDate
 * @property {Institution} institution
 */

/**
 * @typedef {Object} CourseInstance
 * @property {string} uuid
 * @property {string} longName
 * @property {number} number
 * @property {string} timezone
 * @property {{ [uid: string]: "Student" | "TA" | "Instructor"}} userRoles
 * @property {CourseInstanceAllowAccess[]} allowAccess
 */

/**
 * @typedef {Object} SEBConfig
 * @property {string} password
 * @property {string} quitPassword
 * @property {string[]} allowPrograms
 */

/**
 * @typedef {Object} AssessmentAllowAccess
 * @property {"Public" | "Exam" | "SEB"} mode
 * @property {string} examUuid
 * @property {"Student" | "TA" | "Instructor"} role
 * @property {string[]} uids
 * @property {number} credit
 * @property {string} startDate
 * @property {string} endDate
 * @property {number} timeLimitMin
 * @property {string} password
 * @property {SEBConfig} SEBConfig
 */

 /**
  * @typedef {Object} QuestionAlternative
  * @property {number | number[]} points
  * @property {numer | number[]} maxPoints
  * @property {string} id
  * @property {boolean} forceMaxPoints
  * @property {number} triesPerVariant
  */

/**
 * @typedef {Object} ZoneQuestion
 * @property {number | number[]} points
 * @property {number | []} maxPoints
 * @property {string} id
 * @property {boolean} forceMaxPoints
 * @property {QuestionAlternative[]} alternatives
 * @property {number} numberChoose
 * @property {number} triesPerVariant
 */

/**
 * @typedef {Object} Zone
 * @property {string} title
 * @property {number} maxPoints
 * @property {number} maxChoose
 * @property {number} bestQuestions
 * @property {ZoneQuestion[]} questions
 */

/**
 * @typedef {Object} Assessment
 * @property {string} uuid
 * @property {"Homework" | "Exam"} type
 * @property {string} title
 * @property {string} set
 * @property {string} number
 * @property {boolean} allowIssueReporting
 * @property {boolean} multipleInstance
 * @property {boolean} shuffleQuestions
 * @property {AssessmentAllowAccess[]} allowAccess
 * @property {string} text
 * @property {number} maxPoints
 * @property {boolean} autoClose
 * @property {Zone[]} zones
 * @property {boolean} constantQuestionValue
 */

/**
 * @typedef {Object} QuestionExternalGradingOptions
 * @property {boolean} enabled
 * @property {string} image
 * @property {string} entrypoint
 * @property {string[]} serverFilesCourse
 * @property {number} timeout
 * @property {boolean} enableNetworking
 */

 /**
  * @typedef {Object} Question
  * @property {string} uuid
  * @property {"Calculation" | "ShortAnswer" | "MultipleChoice" | "Checkbox" | "File" | "MultipleTrueFalse" | "v3"} type
  * @property {string} title
  * @property {string} topic
  * @property {string[]} secondaryTopics
  * @property {string[]} tags
  * @property {string[]} clientFiles
  * @property {string[]} clientTemplates
  * @property {string} template
  * @property {"Internal" | "External" | "Manual"} gradingMethod
  * @property {boolean} singleVariant
  * @property {boolean} partialCredit
  * @property {Object} options
  * @property {QuestionExternalGradingOptions} externalGradingOptions
  */

/**
 * @typedef {object} CourseInstanceData
 * @property {Either<CourseInstance>} courseInstance
 * @property {{ [tid: string]: Either<Assessment> }} assessments
 */

/**
 * @typedef {object} CourseData
 * @property {Either<Course>} course
 * @property {{ [qid: string]: Either<Question> }} questions
 * @property {{ [ciid: string]: CourseInstanceData }} courseInstances
 */

/**
 * @param {string} courseDir
 * @returns {Promise<CourseData>}
 */
module.exports.loadFullCourseNew = async function(courseDir) {
    const infoCoursePath = path.join(courseDir, 'infoCourse.json');
    const questionsPath = path.join(courseDir, 'questions');
    const courseInstancesPath = path.join(courseDir, 'courseInstances');
    const courseInfo = await module.exports.loadCourseInfo(courseDir);
    const questions = await module.exports.loadQuestions(courseDir);
    const courseInstanceInfo = await loadInfoForDirectory('ciid', courseInstancesPath, 'infoCourseInstance.json', DEFAULT_COURSE_INSTANCE_INFO, schemas.infoCourseInstance, null);
    const courseInstances = /** @type {{ [ciid: string]: CourseInstanceData }} */ ({});
    for (const courseInstanceId in courseInstanceInfo) {
        // TODO: is it really necessary to do all the crazy error checking on `lstat` for the assessments dir?
        // If so, duplicate all that here
        const assessmentsPath = path.join(courseDir, 'courseInstances', courseInstanceId, 'assessments');
        const assessments = /** @type {{ [tid: string]: Either<Assessment> }} */ (await loadInfoForDirectory('tid', assessmentsPath, 'infoAssessment.json', DEFAULT_ASSESSMENT_INFO, schemas.infoAssessment, null));
        const courseInstance = {
            courseInstance: courseInstanceInfo[courseInstanceId],
            assessments,
        };
        courseInstances[courseInstanceId] = courseInstance;
    }
    return {
        course: courseInfo,
        questions,
        courseInstances,
    }
}

/**
 * @param {string} courseDirectory
 * @returns {Promise<Either<Course>>}
 */
module.exports.loadCourseInfo = async function(courseDirectory) {
    return new Promise((resolve) => {
        const infoCoursePath = path.join(courseDirectory, 'infoCourse.json');
        jsonLoad.readInfoJSON(infoCoursePath, schemas.infoCourse, function(err, info) {
            if (err) {
                resolve({ errors:  [err.message] });
                return;
            }

            const warnings = [];

            /** @type {AssessmentSet[]} */
            const assessmentSets = info.assessmentSets || [];
            DEFAULT_ASSESSMENT_SETS.forEach(aset => {
                if (assessmentSets.find(a => a.name === aset.name)) {
                    warnings.push(`Default assessmentSet "${aset.name}" should not be included in infoCourse.json`);
                } else {
                    assessmentSets.push(aset);
                }
            });

            /** @type {Tag[]} */
            const tags = info.tags || [];
            DEFAULT_TAGS.forEach(tag => {
                if (tags.find(t => t.name === tag.name)) {
                    warnings.push(`Default tag "${tag.name}" should not be included in infoCourse.json`);
                } else {
                    tags.push(tag);
                }
            });

            const isExampleCourse = info.uuid === 'fcc5282c-a752-4146-9bd6-ee19aac53fc5'
                && info.title === 'Example Course'
                && info.name === 'XC 101';

            const course = {
                uuid: info.uuid.toLowerCase(),
                path: courseDirectory,
                name: info.name,
                title: info.title,
                timezone: info.timezone,
                topics: info.topics,
                assessmentSets,
                tags,
                options: {
                    useNewQuestionRenderer: _.get(info, 'options.useNewQuestionRenderer', false),
                    isExampleCourse,
                },
            };

            resolve({
                data: course,
                warnings,
            });
        });
    });
}

/**
 * @template T
 * @param {*} id 
 * @param {*} idName 
 * @param {*} jsonPath 
 * @param {*} defaults 
 * @param {*} schema 
 * @param {*} optionSchemaPrefix 
 * @returns {Promise<Either<T>>}
 */
async function loadAndValidateJsonNew(id, idName, jsonPath, defaults, schema, optionSchemaPrefix) {
    let json;
    try {
        json = await jsonLoad.readInfoJSONAsync(jsonPath, schema);
    } catch (err) {
        if (err && err.code && err.path && (err.code === 'ENOTDIR') && err.path === jsonPath) {
            // In a previous version of this code, we'd pre-filter
            // all files in the parent directory to remove anything
            // that may have accidentally slipped in, like .DS_Store.
            // However, that resulted in a huge number of system calls
            // that got really slow for large directories. Now, we'll
            // just blindly try to read a file from the directory and assume
            // that if we see ENOTDIR, that means the directory was not
            // in fact a directory.
            return undefined;
        }
        return either.makeError(err.message);
    }

    try {
        await jsonLoad.validateOptionsAsync(json, jsonPath, optionSchemaPrefix, schemas);
    } catch (err) {
        return either.makeError(err.message);
    }
    json[idName] = id;
    const validationResult = checkInfoValid(idName, json, jsonPath);
    if (validationResult.errors.length > 0) {
        return { errors: validationResult.errors };
    }

    return {
        data: _.defaults(json, defaults),
        warnings: validationResult.warnings,
    }
}

/**
 * Loads and schema-validates all info files in a directory.
 * @template T
 * @param {"qid" | "ciid" | "tid"} idName
 * @param {string} directory
 * @param {string} infoFilename
 * @param {any} defaultInfo
 * @param {object} schema
 * @param {string} optionSchemaPrefix
 * @returns {Promise<{ [id: string]: Either<T> }>}
 */
async function loadInfoForDirectory(idName, directory, infoFilename, defaultInfo, schema, optionSchemaPrefix) {
    // `cache` is an object with which we can cache information derived from course info
    // in between successive calls to `checkInfoValid`
    const infos = /** @type {{ [id: string]: Either<T> }} */ ({});
    const files = await fs.readdir(directory);

    await async.each(files, async function(dir) {
        const infoFile = path.join(directory, dir, infoFilename);
        const info = await loadAndValidateJsonNew(dir, idName, infoFile, defaultInfo, schema, optionSchemaPrefix);
        if (info) {
            infos[dir] = info;
        }
    });

    return infos;
}

/**
 * @template {{ uuid: string }} T
 * @param {{ [id: string]: Either<T>}} infos 
 * @param {(uuid: string, otherIds: string[]) => string} makeErrorMessage
 */
function checkDuplicateUUIDs(infos, makeErrorMessage) {
    // First, create a map from UUIDs to questions that use them
    const uuids = Object.entries(infos).reduce((map, [id, info]) => {
        let ids = map.get(info.data.uuid);
        if (!ids) {
            ids = [];
            map.set(info.data.uuid, ids);
        }
        ids.push(id);
        return map;
    }, /** @type {Map<string, string[]>} */ (new Map()));

    // Do a second pass to add errors for things with duplicate IDs
    uuids.forEach((ids, uuid) => {
        if (ids.length === 1) {
            // Only one question uses this UUID
            return;
        }
        ids.forEach(id => {
            const otherIds = ids.filter(other => other !== id);
            either.addError(infos[id], makeErrorMessage(uuid, otherIds));
        });
    });
}

/**
 * @param {string} courseDirectory 
 */
module.exports.loadQuestions = async function(courseDirectory) {
    const questionsPath = path.join(courseDirectory, 'questions');
    /** @type {{ [qid: string]: Either<Question> }} */
    let questions = {};
    questions = await loadInfoForDirectory('qid', questionsPath, 'info.json', DEFAULT_QUESTION_INFO, schemas.infoQuestion, 'questionOptions');
    checkDuplicateUUIDs(questions, (uuid, ids) => `UUID ${uuid} is used in other questions: ${ids.join(', ')}`);
    return questions;
}
