const fs = require('fs-extra');
const tmp = require('tmp-promise');
const path = require('path');
const sqldb = require('@prairielearn/prairielib/sql-db');
const stringify = require('json-stable-stringify');
const { assert } = require('chai');

const syncFromDisk = require('../../sync/syncFromDisk');

/**
 * @typedef {Object} CourseOptions
 * @property {boolean} useNewQuestionRenderer
 */

/**
 * @typedef {Object} Tag
 * @property {string} name
 * @property {string} color
 * @property {string} description
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
 * @property {string} timezone
 * @property {CourseOptions} options
 * @property {Tag[]} tags
 * @property {Topic[]} topics
 * @property {AssessmentSet[]} assessmentSets
 */

/** @typedef {"Student" | "TA" | "Instructor" | "Superuser"} UserRole */

/**
 * @typedef {Object} CourseInstanceAllowAccess
 * @property {UserRule} role
 * @property {string[]} uids
 * @property {string} startDate
 * @property {string} endDate
 * @property {string} institution
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
 * @property {boolean} allowRealTimeGrading
 * @property {boolean} requireHonorCode
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
 * @typedef {Object} QuestionWorkspaceOptions
 * @property {string} image
 * @property {number} port
 * @property {string[]} gradedFiles
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
  * @property {QuestionWorkspaceOptions} workspaceOptions
  */

/** @typedef {{ assessments: { [id: string]: Assessment }, courseInstance: CourseInstance }} CourseInstanceData */
/** @typedef {{ course: Course, questions: { [id: string]: Question }, courseInstances: { [id: string]: CourseInstanceData } }} CourseData */

/**
 * Accepts a CourseData object and creates a PrairieLearn course directory
 * structure from it. Returns the path to the newly-created directory.
 * 
 * @param {CourseData} courseData - The course data to write to disk
 * @returns string - The path to the directory containing the course data
 */
module.exports.writeCourseToTempDirectory = async function(courseData) {
  const { path: coursePath } = await tmp.dir({ unsafeCleanup: true });
  await this.writeCourseToDirectory(courseData, coursePath);
  return coursePath;
};

/**
 * Accepts a CourseData object and writes it as a PrairieLearn course
 * into the given directory. Removes any existing content from the
 * directory.
 * 
 * @param {CourseData} courseData - The course data to write to disk
 * @param {string} coursePath - The path to the directory to write to
 */
module.exports.writeCourseToDirectory = async function(courseData, coursePath) {
  await fs.emptyDir(coursePath);

  // courseInfo.json
  const courseInfoPath = path.join(coursePath, 'infoCourse.json');
  await fs.writeJSON(courseInfoPath, courseData.course);

  // Write all questions
  const questionsPath = path.join(coursePath, 'questions');
  await fs.ensureDir(questionsPath);
  for (const qid of Object.keys(courseData.questions)) {
    const questionPath = path.join(questionsPath, qid);
    await fs.ensureDir(questionPath);
    const questionInfoPath = path.join(questionPath, 'info.json');
    await fs.writeJSON(questionInfoPath, courseData.questions[qid]);
  }

  // Write all course instances
  const courseInstancesPath = path.join(coursePath, 'courseInstances');
  await fs.ensureDir(courseInstancesPath);
  for (const shortName of Object.keys(courseData.courseInstances)) {
    const courseInstance = courseData.courseInstances[shortName];
    const courseInstancePath = path.join(courseInstancesPath, shortName);
    await fs.ensureDir(courseInstancePath);
    const courseInstanceInfoPath = path.join(courseInstancePath, 'infoCourseInstance.json');
    await fs.writeJSON(courseInstanceInfoPath, courseInstance.courseInstance);

    // Write all assessments for this course instance
    const assessmentsPath = path.join(courseInstancePath, 'assessments');
    await fs.ensureDir(assessmentsPath);
    for (const assessmentName of Object.keys(courseInstance.assessments)) {
      const assessmentPath = path.join(assessmentsPath, assessmentName);
      await fs.ensureDir(assessmentPath);
      const assessmentInfoPath = path.join(assessmentPath, 'infoAssessment.json');
      await fs.writeJSON(assessmentInfoPath, courseInstance.assessments[assessmentName]);
    }
  }
};

module.exports.QUESTION_ID = 'test';
module.exports.ALTERNATIVE_QUESTION_ID = 'test2';
module.exports.WORKSPACE_QUESTION_ID = 'test3';
module.exports.COURSE_INSTANCE_ID = 'Fa19';

/** @type {Course} */
const course = {
  uuid: '5d14d80e-b0b8-494e-afed-f5a47497f5cb',
  name: 'TEST 101',
  title: 'Test Course',
  assessmentSets: [{
    name: 'TEST',
    abbreviation: 'Test',
    heading: 'Testing set',
    color: 'red1',
  }, {
    name: 'ANOTHER TEST',
    abbreviation: 'Another Test',
    heading: 'Another testing set',
    color: 'red2',
  }, {
    name: 'PRIVATE SET',
    abbreviation: 'Private',
    heading: 'Used by the default assessment, do not use in your own tests',
    color: 'red2',
  }],
  topics: [{
    name: 'Test',
    color: 'gray1',
    description: 'A test topic',
  }, {
    name: 'Another test',
    color: 'gray2',
    description: 'Another test topic',
  }],
  tags: [{
    name: 'test',
    color: 'blue1',
    description: 'A test tag',
  }, {
    name: 'another test',
    color: 'blue2',
    description: 'Another test tag',
  }],
};

/** @type {{ [id: string]: Question }} */
const questions = {
  private: {
    uuid: 'aff9236d-4f40-41fb-8c34-f97aed016535',
    title: 'Test question',
    topic: 'Test',
    secondaryTopics: [],
    tags: ['test'],
    type: 'v3',
  },
  [module.exports.QUESTION_ID]: {
    uuid: 'f4ff2429-926e-4358-9e1f-d2f377e2036a',
    title: 'Test question',
    topic: 'Test',
    secondaryTopics: [],
    tags: ['test'],
    type: 'v3',
  },
  [module.exports.ALTERNATIVE_QUESTION_ID]: {
    uuid: '697a6188-8215-4806-92a1-592987342b9e',
    title: 'Another test question',
    topic: 'Test',
    secondaryTopics: [],
    tags: ['test'],
    type: 'Calculation',
  },
  [module.exports.WORKSPACE_QUESTION_ID]: {
    uuid: '894927f7-19b3-451d-8ad1-75974ad2ffb7',
    title: 'Workspace test question',
    topic: 'Workspace',
    secondaryTopics: [],
    tags: ['workspace'],
    type: 'v3',
    workspaceOptions: {
      image: 'prairielearn/workspace-vscode',
      port: 15000,
      gradedFiles: [
        'animal.h',
        'animal.c',
      ],
    },
  },
};

/** @type {{ [id: string]: CourseInstanceData }} */
const courseInstances = {
  [module.exports.COURSE_INSTANCE_ID]: {
    assessments: {
      test: {
        uuid: '73432669-2663-444e-ade5-43f689a50dea',
        title: 'Test assessment',
        type: 'Exam',
        set: 'PRIVATE SET',
        number: '100',
        allowAccess: [{
          mode: 'Exam',
          role: 'Student',
        }],
        zones: [{
          title: 'zone 1',
          questions: [{
            points: 10,
            alternatives: [{ id: 'private' }],
          }],
        }],
      },
    },
    courseInstance: {
      uuid: 'a17b1abd-eaf6-45dc-99bc-9890a7fb345e',
      longName: 'Testing instance',
      userRoles: {
        'user1@illinois.edu': 'Instructor',
        'user2@illinois.edu': 'TA',
      },
    },
  },
};

/**
 * @returns {CourseData} - The base course data for syncing testing
 */
module.exports.getCourseData = function() {
  // Round-trip through JSON.stringify to ensure that mutations to nested
  // objects aren't reflected in the original objects.
  const courseData = {
    course,
    questions,
    courseInstances,
  };
  return JSON.parse(JSON.stringify(courseData));
};

/**
 * Async wrapper for syncing course data from a directory. Also stubs out the
 * logger interface.
 */
module.exports.syncCourseData = function(courseDir) {
  const logger = {
    verbose: () => {},
    debug: () => {},
    info: () => {},
    warn: () => {},
  };
  return new Promise((resolve, reject) => {
    syncFromDisk.syncOrCreateDiskToSql(courseDir, logger, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
};

module.exports.createAndSyncCourseData = async function() {
  const courseData = this.getCourseData();
  const courseDir = await module.exports.writeCourseToTempDirectory(courseData);
  await module.exports.syncCourseData(courseDir);

  return {
    courseData,
    courseDir,
  };
};

/**
 * Writes the given course data to a new temporary directory and returns the
 * path to the directory.
 * 
 * @param {CourseData} courseData - The course data to write and sync
 * @returns {string} the path to the new temp directory
 */
module.exports.writeAndSyncCourseData = async function(courseData) {
  const courseDir = await this.writeCourseToTempDirectory(courseData);
  await this.syncCourseData(courseDir);
  return courseDir;
};

/**
 * Overwrites the course data in the given directory and 
 * 
 * @param {CourseData} courseData - The course data write and sync
 * @param {string} courseDir - The path to write the course data to
 */
module.exports.overwriteAndSyncCourseData = async function(courseData, courseDir) {
  await this.writeCourseToDirectory(courseData, courseDir);
  await this.syncCourseData(courseDir);
};

module.exports.dumpTable = async function(tableName) {
  const res = await sqldb.queryAsync(`SELECT * FROM ${tableName};`, {});
  return res.rows;
};

module.exports.captureDatabaseSnapshot = async function() {
  return {
    courseInstances: await module.exports.dumpTable('course_instances'),
    assessments: await module.exports.dumpTable('assessments'),
    assessmentSets: await module.exports.dumpTable('assessment_sets'),
    topics: await module.exports.dumpTable('topics'),
    tags: await module.exports.dumpTable('tags'),
    courseInstanceAccesRules: await module.exports.dumpTable('course_instance_access_rules'),
    assessmentAccessRules: await module.exports.dumpTable('assessment_access_rules'),
    zones: await module.exports.dumpTable('zones'),
    alternativeGroups: await module.exports.dumpTable('alternative_groups'),
    assessmentQuestions: await module.exports.dumpTable('assessment_questions'),
    questions: await module.exports.dumpTable('questions'),
    questionTags: await module.exports.dumpTable('question_tags'),
    users: await module.exports.dumpTable('users'),
    enrollments: await module.exports.dumpTable('enrollments'),
  };
};

/**
 * Computes setA U setB.
 * 
 * @template T
 * @param {Set.<T>} setA 
 * @param {Set.<T>}setB 
 * @returns {Set.<T>} The union of setA and setB
 */
function setUnion(setA, setB) {
  return new Set([...setA, ...setB]);
}

/**
 * Checks if two sets contain the same elements.
 * 
 * @param {Set.<any>} setA
 * @param {Set.<any>} setB 
 * @returns {boolean} whether or not the sets contain the same elements.
 */
function checkSetsSame(setA, setB) {
  const union = setUnion(setA, setB);
  return setA.size === setB.size && union.size === setA.size;
}

/**
 * Asserts that two snapshots match each other. Two snapshots are defined as
 * matching if they both contain the same keys and if for each key, the array
 * of values contains the same elements. Elements may be in different orders.
 * Optionally, a subset of the keys in the snapshot can be ignored.
 * 
 * @param {{ [key: string]: any[] }} snapshotA - The first snapshot
 * @param {{ [key: string]: any[] }} snapshotB - The second snapshot
 * @param {string[]} [ignoreKeys=[]] An optional list of keys to ignore
 */
module.exports.assertSnapshotsMatch = function(snapshotA, snapshotB, ignoredKeys = []) {
  // Sanity check - make sure both snapshots have the same keys
  assert(checkSetsSame(new Set(Object.keys(snapshotA)), new Set(Object.keys(snapshotB))), 'snapshots contained different keys');
  for (const key of Object.keys(snapshotA)) {
    if (ignoredKeys.indexOf(key) !== -1) continue;
    // Build a set of deterministically-stringified rows for each snapshot
    const setA = new Set(snapshotA[key].map(s => stringify(s)));
    const setB = new Set(snapshotB[key].map(s => stringify(s)));
    assert(checkSetsSame(setA, setB), `Snapshot of ${key} did not match`);
  }
};

/**
 * Asserts that `snapshotA` is a subset of `snapshotB` using the same algorithm
 * from `assertSnapshotsMatch`.
 *
 * @param {{ [key: string]: any[] }} snapshotA - The first snapshot
 * @param {{ [key: string]: any[] }} snapshotB - The second snapshot
 * @param {string[]} [ignoreKeys=[]] An optional list of keys to ignore
 */
module.exports.assertSnapshotSubset = function(snapshotA, snapshotB, ignoredKeys = []) {
  // Sanity check - make sure both snapshots have the same keys
  assert(checkSetsSame(new Set(Object.keys(snapshotA)), new Set(Object.keys(snapshotB))), 'snapshots contained different keys');
  for (const key of Object.keys(snapshotA)) {
    if (ignoredKeys.indexOf(key) !== -1) continue;
    // Build a set of deterministically-stringified rows for each snapshot
    const setA = new Set(snapshotA[key].map(s => stringify(s)));
    const setB = new Set(snapshotB[key].map(s => stringify(s)));
    assert([...setA].every(entry => setB.has(entry)), `Snapshot of ${key} is not a subset`);
  }
};
