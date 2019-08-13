// @ts-check
const ERR = require('async-stacktrace');
const path = require('path');
const _ = require('lodash');
const fs = require('fs-extra');
const util = require('util');
const async = require('async');
const moment = require('moment');
const jju = require('jju');
const Ajv = require('ajv');

const schemas = require('../schemas');
const infofile = require('./infofile');
const jsonLoad = require('../lib/json-load');

// We use a single global instance so that schemas aren't recompiled every time they're used
const ajv = new Ajv({ schemaId: 'auto' });
// @ts-ignore
ajv.addMetaSchema(require('ajv/lib/refs/json-schema-draft-04.json'));

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

// For testing if a string is a v4 UUID
const UUID_REGEX = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/;
// For finding all v4 UUIDs in a string/file
const FILE_UUID_REGEX = /"uuid":\s*"([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})"/g;

/** 
 * @template T
 * @typedef {import('./infofile').InfoFile<T>} InfoFile<T>
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
 * @property {UserRole} role
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
 * @property {boolean} allowIssueReporting
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
  * @property {number | number[]} maxPoints
  * @property {string} id
  * @property {boolean} forceMaxPoints
  * @property {number} triesPerVariant
  */

/**
 * @typedef {Object} ZoneQuestion
 * @property {number | number[]} points
 * @property {number | []} maxPoints
 * @property {string} [id]
 * @property {boolean} forceMaxPoints
 * @property {QuestionAlternative[]} [alternatives]
 * @property {number} numberChoose
 * @property {number} triesPerVariant
 */

/**
 * @typedef {Object} Zone
 * @property {string} title
 * @property {number} maxPoints
 * @property {number} numberChoose
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
  * @property {any} id
  * @property {string} qid
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
 * @property {InfoFile<CourseInstance>} courseInstance
 * @property {{ [tid: string]: InfoFile<Assessment> }} assessments
 */

/**
 * @typedef {object} CourseData
 * @property {InfoFile<Course>} course
 * @property {{ [qid: string]: InfoFile<Question> }} questions
 * @property {{ [ciid: string]: CourseInstanceData }} courseInstances
 */

/**
 * @param {string} courseDir The directory of the course
 * @param {string} qid The QID of the question to load
 */
module.exports.loadSingleQuestion = async function(courseDir, qid) {
    const infoQuestionPath = path.join(courseDir, 'questions', qid, 'info.json');
    const result = await loadAndValidateJsonNew(courseDir, infoQuestionPath, DEFAULT_QUESTION_INFO, schemas.infoQuestion, validateQuestion);
    // TODO: once we have error/warning handling elsewhere in the stack,
    // rewrite to just propagate the Either directly instead of throwing here.
    if (infofile.hasErrors(result)) {
        throw new Error(infofile.stringifyErrors(result));
    }
    return result.data;
};

/**
 * TODO: Remove `logger` param when we do later refactoring.
 * @param {string} courseDir
 * @param {(err: Error | null | undefined, course?: any, newCourse?: CourseData) => void} callback
 */
module.exports.loadFullCourse = function(courseDir, logger, callback) {
    util.callbackify(this.loadFullCourseNew)(courseDir, (err, courseData) => {
        if (ERR(err, callback)) return;

        // First, scan through everything to check for errors, and if we find one, "throw" it
        if (infofile.hasErrors(courseData.course)) {
            return callback(new Error(infofile.stringifyErrors(courseData.course)));
        }
        for (const qid in courseData.questions) {
            if (infofile.hasErrors(courseData.questions[qid])) {
                return callback(new Error(infofile.stringifyErrors(courseData.questions[qid])));
            }
        }
        for (const ciid in courseData.courseInstances) {
            if (infofile.hasErrors(courseData.courseInstances[ciid].courseInstance)) {
                return callback(new Error(infofile.stringifyErrors(courseData.courseInstances[ciid].courseInstance)));
            }
        }
        for (const ciid in courseData.courseInstances) {
            const courseInstance = courseData.courseInstances[ciid];
            for (const tid in courseInstance.assessments) {
                if (infofile.hasErrors(courseInstance.assessments[tid])) {
                    return callback(new Error(infofile.stringifyErrors(courseInstance.assessments[tid])));
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
        callback(null, course, courseData);
    });
};

/**
 * @param {string} courseDir
 * @returns {Promise<CourseData>}
 */
module.exports.loadFullCourseNew = async function(courseDir) {
    const courseInfo = await module.exports.loadCourseInfo(courseDir);
    const questions = await module.exports.loadQuestions(courseDir);
    const courseInstanceInfos = await module.exports.loadCourseInstances(courseDir);
    const courseInstances = /** @type {{ [ciid: string]: CourseInstanceData }} */ ({});
    for (const courseInstanceId in courseInstanceInfos) {
        // TODO: is it really necessary to do all the crazy error checking on `lstat` for the assessments dir?
        // If so, duplicate all that here
        const assessments = await module.exports.loadAssessments(courseDir, courseInstanceId, questions);
        const courseInstance = {
            courseInstance: courseInstanceInfos[courseInstanceId],
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
 * @param {CourseData} courseData
 * @returns {Promise<{ path: string, errors: string[] }[]>}
 */
module.exports.getPathsWithMissingUuids = async function(courseData) {
    // TODO: this is probably unused, remove later if that ends up being the case
    const paths = [];
    if (!infofile.hasUuid(courseData.course)) {
        paths.push({
            path: 'infoCourse.json',
            errors: courseData.course.errors,
        });
    }
    Object.entries(courseData.questions).forEach(([qid, questionInfo]) => {
        if (!infofile.hasUuid(questionInfo)) {
            paths.push({
                path: path.join('questions', qid, 'info.json'),
                errors: questionInfo.errors,
            });
        }
    });
    Object.entries(courseData.courseInstances).forEach(([ciid, courseInstanceInfo]) => {
        if (!infofile.hasUuid(courseInstanceInfo.courseInstance)) {
            paths.push({
                path: path.join('courseInstances', ciid, 'infoCourseInstance.json'),
                errors: courseInstanceInfo.courseInstance.errors,
            });
        }
        Object.entries(courseInstanceInfo.assessments).forEach(([tid, info]) => {
            if (!infofile.hasUuid(info)) {
                paths.push({
                    path: path.join('courseInstance', ciid, 'assessments', tid, 'infoAssessment.json'),
                    errors: info.errors,
                });
            }
        })
    });
    return paths;
}

/**
 * Loads a JSON file at the path `path.join(coursePath, filePath). The
 * path is passed as two separate paths so that we can avoid leaking the
 * absolute path on disk to users.
 * @template T
 * @param {string} coursePath
 * @param {string} filePath
 * @param {object} [schema]
 * @returns {Promise<InfoFile<T>>} 
 */
module.exports.loadInfoFile = async function(coursePath, filePath, schema) {
    const absolutePath = path.join(coursePath, filePath);
    let contents;
    try {
        contents = await fs.readFile(absolutePath, 'utf-8');
    } catch (err) {
        if (err.code === 'ENOTDIR' && err.path === absolutePath) {
            // In a previous version of this code, we'd pre-filter
            // all files in the parent directory to remove anything
            // that may have accidentally slipped in, like .DS_Store.
            // However, that resulted in a huge number of system calls
            // that got really slow for large directories. Now, we'll
            // just blindly try to read a file from the directory and assume
            // that if we see ENOTDIR, that means the directory was not
            // in fact a directory.
            return null;
        } 

        // If it wasn't a missing file, this is another error. Propagate it to
        // the caller.
        return infofile.makeError(`Error reading JSON file ${filePath}: ${err.code}`);
    }

    try {
        // jju is about 5x slower than standard JSON.parse. In the average
        // case, we'll have valid JSON, so we can take the fast path. If we
        // fail to parse, we'll take the hit and reparse with jju to generate
        // a better error report for users.
        const json = JSON.parse(contents);
        if (!json.uuid) {
            return infofile.makeError('UUID is missing');
        }
        if (!UUID_REGEX.test(json.uuid)) {
            return infofile.makeError('UUID is not a valid v4 UUID');
        }

        if (!schema) {
            // Skip schema validation, just return the data
            return {
                uuid: json.uuid,
                data: json,
            };
        }

        // Validate file against schema
        const validate = ajv.compile(schema);
        try {
            const valid = validate(json);
            if (!valid) {
                const result = { uuid: json.uuid };
                infofile.addError(result, ajv.errorsText(validate.errors));
                return result;
            }
            return {
                uuid: json.uuid,
                data: json,
            };
        } catch (err) {
            return infofile.makeError(err.message);
        }
    } catch (err) {
        // The document was still valid JSON, but we may still be able to
        // extract a UUID from the raw files contents with a regex.
        const match = (contents || '').match(FILE_UUID_REGEX);
        if (!match) {
            return infofile.makeError('UUID not found in file');
        }
        if (match.length > 1) {
            return infofile.makeError('More that one UUID found in file');
        }

        // Extract and store UUID
        const uuid = match[0].match(UUID_REGEX)[0];

        // If we found a UUID, let's re-parse with jju to generate a better
        // error report for users.
        try {
            // This should always throw
            jju.parse(contents, { mode: 'json' });
        } catch (e) {
            const result = { uuid };
            infofile.addError(result, `Error parsing JSON: ${e.message}`);
            return result;
        }

        // If we got here, we must not have caught an error above, which is
        // completely unexpected. For safety, throw an error to abort sync.
        throw new Error(`Expected file ${absolutePath} to have invalid JSON, but parsing succeeded.`);
    }
}

/**
 * @param {string} courseDirectory
 * @returns {Promise<InfoFile<Course>>}
 */
module.exports.loadCourseInfo = async function(courseDirectory) {
    /** @type {import('./infofile').InfoFile<Course>} */
    const loadedData = await module.exports.loadInfoFile(courseDirectory, 'infoCourse.json', schemas.infoCourse);
    if (infofile.hasErrors(loadedData)) {
        // We'll only have an error if we couldn't parse JSON data; abort
        return loadedData;
    }

    const info = loadedData.data;

    // Make a first pass over assessment sets, warn about duplicates
    /** @type {Map<string, AssessmentSet>} */
    const knownAssessmentSets = new Map();
    /** @type{Set<string>} */
    const duplicateAssessmentSetNames = new Set();
    (info.assessmentSets || []).forEach(aset => {
        if (knownAssessmentSets.has(aset.name)) {
            duplicateAssessmentSetNames.add(aset.name);
        }
        knownAssessmentSets.set(aset.name, aset);
    });
    const duplicateAssessmentSetNamesString = [...duplicateAssessmentSetNames.values()].join(', ');
    infofile.addWarning(loadedData, `Found duplicate assessment sets: ${duplicateAssessmentSetNamesString}. Only the last of each duplicate will be synced.`);

    // Add any default assessment sets that weren't also defined by the course
    DEFAULT_ASSESSMENT_SETS.forEach(aset => {
        if (!knownAssessmentSets.has(aset.name)) {
            knownAssessmentSets.set(aset.name, aset);
        }
    });

    // Turn the map back into a list; the JS spec ensures that Maps remember
    // insertion order, so the order is preserved.
    const assessmentSets = [...knownAssessmentSets.values()];

    // Now, we do the same thing for tags
    // Make a first pass over tags, warn about duplicates
    const knownTags = new Map();
    const duplicateTagNames = new Set();
    (info.tags || []).forEach(tag => {
        if (knownTags.has(tag.name)){
            duplicateTagNames.add(tag.name);
        }
        knownTags.set(tag.name, tag);
    });
    const duplicateTagNamesString = [...duplicateTagNames.values()].join(', ');
    infofile.addWarning(loadedData, `Found duplicate tags: ${duplicateTagNamesString}. Only the last of each duplicate will be synced.`);

    // Add any default tags that weren't also defined by the course
    DEFAULT_TAGS.forEach(tag => {
        if (!knownTags.has(tag.name)) {
            knownTags.set(tag.name, tag);
        }
    });

    // Turn the map back into a list; the JS spec ensures that Maps remember
    // insertion order, so the order is preserved.
    const tags = [...knownTags.values()];

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

    loadedData.data = course;
    return loadedData;
}

/**
 * @template T
 * @param {string} coursePath
 * @param {string} filePath 
 * @param {any} defaults 
 * @param {any} schema 
 * @param {(info: T) => Promise<{ warnings?: string[], errors?: string[] }>} validate
 * @returns {Promise<InfoFile<T>>}
 */
async function loadAndValidateJsonNew(coursePath, filePath, defaults, schema, validate) {
    const loadedJson = await module.exports.loadInfoFile(coursePath, filePath, schema);
    if (loadedJson === null) {
        // This should only occur if we looked for a file in a non-directory,
        // as would happen if there was a .DS_Store file.
        return null;
    }
    if (infofile.hasErrors(loadedJson)) {
        return loadedJson;
    }

    const validationResult = await validate(loadedJson.data);
    if (validationResult.errors.length > 0) {
        infofile.addErrors(loadedJson, validationResult.errors);
        return loadedJson;
    }

    loadedJson.data = _.defaults(loadedJson.data, defaults);
    infofile.addWarnings(loadedJson, validationResult.warnings);
    return loadedJson;
}

/**
 * Loads and schema-validates all info files in a directory.
 * @template T
 * @param {string} coursePath The path of the course being synced
 * @param {string} directory The path of the directory relative to `coursePath`
 * @param {string} infoFilename
 * @param {any} defaultInfo
 * @param {object} schema
 * @param {(info: T) => Promise<{ warnings?: string[], errors?: string[] }>} validate
 * @returns {Promise<{ [id: string]: InfoFile<T> }>}
 */
async function loadInfoForDirectory(coursePath, directory, infoFilename, defaultInfo, schema, validate) {
    const infos = /** @type {{ [id: string]: InfoFile<T> }} */ ({});
    let files;
    try {
        files = await fs.readdir(path.join(coursePath, directory));
    } catch (e) {
        if (e.code === 'ENOENT') {
            // Missing directory; fail gracefully and return empty collection
            return infos;
        }
        // Some other error, permissions perhaps. Throw to abort sync.
        throw e;
    }

    await async.each(files, async function(dir) {
        const infoFile = path.join(directory, dir, infoFilename);
        const info = await loadAndValidateJsonNew(coursePath, infoFile, defaultInfo, schema, validate);
        if (info) {
            infos[dir] = info;
        }
    });

    return infos;
}

/**
 * @template T
 * @param {{ [id: string]: InfoFile<T>}} infos 
 * @param {(uuid: string, otherIds: string[]) => string} makeErrorMessage
 */
function checkDuplicateUUIDs(infos, makeErrorMessage) {
    // First, create a map from UUIDs to questions that use them
    const uuids = Object.entries(infos).reduce((map, [id, info]) => {
        if (!info.data) {
            // Either missing or error validating; skip.
            return map;
        }
        let ids = map.get(info.uuid);
        if (!ids) {
            ids = [];
            map.set(info.uuid, ids);
        }
        ids.push(id);
        return map;
    }, /** @type {Map<string, string[]>} */ (new Map()));

    // Do a second pass to add errors for things with duplicate IDs
    // We also null out UUIDs for items where duplicates are found
    uuids.forEach((ids, uuid) => {
        if (ids.length === 1) {
            // Only one question uses this UUID
            return;
        }
        ids.forEach(id => {
            const otherIds = ids.filter(other => other !== id);
            infofile.addWarning(infos[id], makeErrorMessage(uuid, otherIds));
            infos[id].uuid = null;
        });
    });
}

/**
 * @param {Question} question 
 * @returns {Promise<{ warnings: string[], errors: string[] }>}
 */
async function validateQuestion(question) {
    const warnings = [];
    const errors = [];

    if (question.type && question.options) {
        try {
            const schema = schemas[`questionOptions${question.type}`];
            const options = question.options;
            await jsonLoad.validateJSONAsync(options, schema);
        } catch (err) {
            errors.push(err.message);
        }
    }

    return { warnings, errors };
}

/**
 * @param {Assessment} assessment 
 * @param {{ [qid: string]: any }} questions
 * @returns {Promise<{ warnings: string[], errors: string[] }>}
 */
async function validateAssessment(assessment, questions) {
    const warnings = [];
    const errors = [];

    // TODO: we previously validated that all assessment sets listed in assessments
    // were also present in infoCourse.json. I removed that check for now, but we
    // still need to treat assessment sets like we do topics and tags and create them
    // on the fly for courses
    // check assessment access rules
    if (_(assessment).has('allowAccess')) {
        _(assessment.allowAccess).forEach(function(rule) {
            let startDate, endDate;
            if ('startDate' in rule) {
                startDate = moment(rule.startDate, moment.ISO_8601);
                if (startDate.isValid() == false) {
                    errors.push(`Invalid allowAccess startDate: ${rule.startDate}`);
                }
            }
            if ('endDate' in rule) {
                endDate = moment(rule.endDate, moment.ISO_8601);
                if (endDate.isValid() == false) {
                    errors.push(`Invalid allowAccess endDate: ${rule.startDate}`);
                }
            }
            if (startDate && endDate && startDate.isAfter(endDate)) {
                errors.push(`Invalid allowAccess rule: startDate (${rule.startDate}) must not be after endDate (${rule.endDate})`);
            }
        });
    }

    const foundQids = new Set();
    const duplicateQids = new Set();
    const missingQids = new Set();
    /** @type {(qid: string) => void} */
    const checkAndRecordQid = (qid) => {
        if (!(qid in questions)) {
            missingQids.add(qid);
        }
        if (!foundQids.has(qid)) {
            foundQids.add(qid);
        } else {
            duplicateQids.add(qid);
        }
    }
    (assessment.zones || []).forEach(zone => {
        (zone.questions || []).map(zoneQuestion => {
            // We'll normalize either single questions or alternative groups
            // to make validation easier
            /** @type {{ points: number | number[], maxPoints: number | number[] }[]} */
            let alternatives = [];
            if ('alternatives' in zoneQuestion && 'id' in zoneQuestion) {
                errors.push('Cannot specify both "alternatives" and "id" in one question');
            } else if ('alternatives' in zoneQuestion) {
                zoneQuestion.alternatives.forEach(alternative => checkAndRecordQid(alternative.id));
                alternatives = zoneQuestion.alternatives.map(alternative => ({
                    points: alternative.points || zoneQuestion.points,
                    maxPoints: alternative.maxPoints || zoneQuestion.maxPoints,
                }));
            } else if ('id' in zoneQuestion) {
                checkAndRecordQid(zoneQuestion.id);
                alternatives = [{
                    points: zoneQuestion.points,
                    maxPoints: zoneQuestion.maxPoints,
                }];
            } else {
                errors.push(`Zone question must specify either "alternatives" or "id"`);
            }

            alternatives.forEach(alternative => {
                if (assessment.type === 'Exam') {
                    if (alternative.maxPoints != undefined) {
                        errors.push('Cannot specify "maxPoints" for a question in an "Exam" assessment');
                    }
                    if (alternative.points == undefined) {
                        errors.push('Must specify "points" for a question in an "Exam" assessment');
                    }
                }
                if (assessment.type === 'Homework') {
                    if (alternative.maxPoints == undefined) {
                        errors.push('Must specify "maxPoints" for a question in a "Homework" assessment');
                    }
                    if (Array.isArray(alternative.points)) {
                        errors.push('Cannot specify "points" as a list for a question in a "Homework" assessment');
                    }
                }
            });
        });
    });

    if (duplicateQids.size > 0) {
        errors.push(`The following questions are used more than once: ${[...duplicateQids].join(', ')}`);
    }

    if (missingQids.size > 0) {
        errors.push(`The following questions do not exist in this course: ${[...missingQids].join(', ')}`)
    }

    return { warnings, errors };
}

/**
 * @param {CourseInstance} courseInstance
 * @returns {Promise<{ warnings: string[], errors: string[] }>}
 */
async function validateCourseInstance(courseInstance) {
    const warnings = [];
    const errors = [];

    if (_(courseInstance).has('allowIssueReporting')) {
        if (courseInstance.allowIssueReporting) {
            warnings.push('"allowIssueReporting" is no longer needed.');
        } else {
            errors.push('"allowIssueReporting" is no longer permitted in "infoCourseInstance.json". Instead, set "allowIssueReporting" in "infoAssessment.json" files.');
        }
    }

    return { warnings, errors };
}

/**
 * Loads all questions in a course directory.
 * 
 * @param {string} courseDirectory 
 */
module.exports.loadQuestions = async function(courseDirectory) {
    /** @type {{ [qid: string]: InfoFile<Question> }} */
    const questions = await loadInfoForDirectory(courseDirectory, 'questions', 'info.json', DEFAULT_QUESTION_INFO, schemas.infoQuestion, validateQuestion);
    checkDuplicateUUIDs(questions, (uuid, ids) => `UUID ${uuid} is used in other questions: ${ids.join(', ')}`);
    return questions;
}

/**
 * Loads all course instances in a course directory.
 * 
 * @param {string} courseDirectory
 */
module.exports.loadCourseInstances = async function(courseDirectory) {
    /** @type {{ [ciid: string]: InfoFile<CourseInstance> }} */
    const courseInstances = await loadInfoForDirectory(courseDirectory, 'courseInstances', 'infoCourseInstance.json', DEFAULT_COURSE_INSTANCE_INFO, schemas.infoCourseInstance, validateCourseInstance);
    checkDuplicateUUIDs(courseInstances, (uuid, ids) => `UUID ${uuid} is used in other course instances: ${ids.join(', ')}`);
    return courseInstances;
}

/**
 * Loads all assessments in a course instance.
 * 
 * @param {string} courseDirectory
 * @param {string} courseInstance
 * @param {{ [qid: string]: any }} questions
 */
module.exports.loadAssessments = async function(courseDirectory, courseInstance, questions) {
    const assessmentsPath = path.join('courseInstances', courseInstance, 'assessments');
    /** @type {(assessment: Assessment) => Promise<{ warnings?: string[], errors?: string[] }>} */
    const validateAssessmentWithQuestions = (assessment) => validateAssessment(assessment, questions);
    /** @type {{ [tid: string]: InfoFile<Assessment> }} */
    const assessments = await loadInfoForDirectory(courseDirectory, assessmentsPath, 'infoAssessment.json', DEFAULT_ASSESSMENT_INFO, schemas.infoAssessment, validateAssessmentWithQuestions);
    checkDuplicateUUIDs(assessments, (uuid, ids) => `UUID ${uuid} is used in other assessments in this course instance: ${ids.join(', ')}`);
    return assessments;
}
