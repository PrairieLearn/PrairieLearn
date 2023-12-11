// @ts-check
import { promisify } from 'util';
import * as fs from 'fs-extra';
import * as tmp from 'tmp-promise';
import * as path from 'path';
import * as sqldb from '@prairielearn/postgres';
const stringify = require('json-stable-stringify');
import { assert } from 'chai';

import * as syncFromDisk from '../../sync/syncFromDisk';

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
 * @typedef {Object} Module
 * @property {string} name
 * @property {string} heading
 */

/**
 * @typedef {Object} Course
 * @property {string} uuid
 * @property {string} name
 * @property {string} title
 * @property {string} [timezone]
 * @property {CourseOptions} [options]
 * @property {Tag[]} tags
 * @property {Topic[]} topics
 * @property {AssessmentSet[]} assessmentSets
 * @property {Module[]} [assessmentModules]
 */

/**
 * @typedef {Object} CourseInstanceAllowAccess
 * @property {string[]} [uids]
 * @property {string} [startDate]
 * @property {string} [endDate]
 * @property {string} [institution]
 */

/**
 * @typedef {Object} CourseInstance
 * @property {string} uuid
 * @property {string} longName
 * @property {number} [number]
 * @property {string} [timezone]
 * @property {CourseInstanceAllowAccess[]} [allowAccess]
 * @property {"Set" | "Module"} [groupAssessmentsBy]
 */

/**
 * @typedef {Object} GroupRole
 * @property {string} name
 * @property {number} [minimum]
 * @property {number} [maximum]
 * @property {boolean} [canAssignRolesAtStart]
 * @property {boolean} [canAssignRolesDuringAssessment]
 * @property {boolean} [canSubmitAssessment]
 */

/**
 * @typedef {Object} SEBConfig
 * @property {string} password
 * @property {string} quitPassword
 * @property {string[]} allowPrograms
 */

/**
 * @typedef {Object} AssessmentAllowAccess
 * @property {"Public" | "Exam" | "SEB"} [mode]
 * @property {string} [examUuid]
 * @property {string[]} [uids]
 * @property {number} [credit]
 * @property {string} [startDate]
 * @property {string} [endDate]
 * @property {number} [timeLimitMin]
 * @property {string} [password]
 * @property {SEBConfig} [SEBConfig]
 * @property {boolean} [active]
 */

/**
 * @typedef {Object} QuestionAlternative
 * @property {number | number[]} [points]
 * @property {number | number[]} [autoPoints]
 * @property {number} [maxPoints]
 * @property {number} [maxAutoPoints]
 * @property {number} [manualPoints]
 * @property {string} [id]
 * @property {boolean} [forceMaxPoints]
 * @property {number} [triesPerVariant]
 */

/**
 * @typedef {Object} ZoneQuestion
 * @property {number | number[]} [points]
 * @property {number | number[]} [autoPoints]
 * @property {number} [maxPoints]
 * @property {number} [maxAutoPoints]
 * @property {number} [manualPoints]
 * @property {string} [id]
 * @property {boolean} [forceMaxPoints]
 * @property {QuestionAlternative[]} [alternatives]
 * @property {number} [numberChoose]
 * @property {number} [triesPerVariant]
 * @property {string[]} [canSubmit]
 * @property {string[]} [canView]
 */

/**
 * @typedef {Object} Zone
 * @property {string} [title]
 * @property {number} [maxPoints]
 * @property {number} [maxChoose]
 * @property {number} [bestQuestions]
 * @property {ZoneQuestion[]} [questions]
 * @property {string[]} [canSubmit]
 * @property {string[]} [canView]
 */

/**
 * @typedef {Object} Assessment
 * @property {string} uuid
 * @property {"Homework" | "Exam"} type
 * @property {string} title
 * @property {string} set
 * @property {string} [module]
 * @property {string} number
 * @property {GroupRole[]} [groupRoles]
 * @property {boolean} [allowIssueReporting]
 * @property {boolean} [allowRealTimeGrading]
 * @property {boolean} [requireHonorCode]
 * @property {boolean} [multipleInstance]
 * @property {boolean} [shuffleQuestions]
 * @property {AssessmentAllowAccess[]} [allowAccess]
 * @property {string} [text]
 * @property {number} [maxPoints]
 * @property {boolean} [autoClose]
 * @property {Zone[]} [zones]
 * @property {boolean} [constantQuestionValue]
 * @property {boolean} [groupWork]
 * @property {number} [groupMaxSize]
 * @property {number} [groupMinSize]
 * @property {boolean} [studentGroupCreate]
 * @property {boolean} [studentGroupJoin]
 * @property {boolean} [studentGroupLeave]
 * @property {boolean} [hasRoles]
 * @property {string[]} [canSubmit]
 * @property {string[]} [canView]
 */

/**
 * @typedef {Object} QuestionExternalGradingOptions
 * @property {boolean} [enabled]
 * @property {string} image
 * @property {string} entrypoint
 * @property {string[]} [serverFilesCourse]
 * @property {number} [timeout]
 * @property {boolean} [enableNetworking]
 * @property {Record<string, string | null>} [environment]
 */

/**
 * @typedef {Object} QuestionWorkspaceOptions
 * @property {string} image
 * @property {number} port
 * @property {string} home
 * @property {string} [args]
 * @property {string[]} [gradedFiles]
 * @property {string} [rewriteUrl]
 * @property {boolean} [enableNetworking]
 * @property {Record<string, string | null>} [environment]
 */

/**
 * @typedef {Object} Question
 * @property {string} uuid
 * @property {"Calculation" | "MultipleChoice" | "Checkbox" | "File" | "MultipleTrueFalse" | "v3"} type
 * @property {string} title
 * @property {string} topic
 * @property {string[]} [tags]
 * @property {string[]} [clientFiles]
 * @property {string[]} [clientTemplates]
 * @property {string} [template]
 * @property {"Internal" | "External" | "Manual"} [gradingMethod]
 * @property {boolean} [singleVariant]
 * @property {boolean} [showCorrectAnswer]
 * @property {boolean} [partialCredit]
 * @property {Object} [options]
 * @property {QuestionExternalGradingOptions} [externalGradingOptions]
 * @property {QuestionWorkspaceOptions} [workspaceOptions]
 */

/** @typedef {{ assessments: { [id: string]: Assessment }, courseInstance: CourseInstance }} CourseInstanceData */
/** @typedef {{ course: Course, questions: { [id: string]: Question }, courseInstances: { [id: string]: CourseInstanceData } }} CourseData */

/**
 * Accepts a CourseData object and creates a PrairieLearn course directory
 * structure from it. Returns the path to the newly-created directory.
 *
 * @param {CourseData} courseData - The course data to write to disk
 * @returns {Promise<string>} - The path to the directory containing the course data
 */
export async function writeCourseToTempDirectory(courseData) {
  const { path: coursePath } = await tmp.dir({ unsafeCleanup: true });
  await writeCourseToDirectory(courseData, coursePath);
  return coursePath;
}

/**
 * Accepts a CourseData object and writes it as a PrairieLearn course
 * into the given directory. Removes any existing content from the
 * directory.
 *
 * @param {CourseData} courseData - The course data to write to disk
 * @param {string} coursePath - The path to the directory to write to
 */
export async function writeCourseToDirectory(courseData, coursePath) {
  await fs.emptyDir(coursePath);

  // infoCourse.json
  const courseInfoPath = path.join(coursePath, 'infoCourse.json');
  await fs.writeJSON(courseInfoPath, courseData.course);

  // Write all questions
  const questionsPath = path.join(coursePath, 'questions');
  await fs.ensureDir(questionsPath);
  for (const qid of Object.keys(courseData.questions)) {
    // Handle nested questions - split on '/' and use components to construct
    // the nested directory structure.
    const questionPath = path.join(questionsPath, ...qid.split('/'));
    await fs.ensureDir(questionPath);
    const questionInfoPath = path.join(questionPath, 'info.json');
    await fs.writeJSON(questionInfoPath, courseData.questions[qid]);
  }

  // Write all course instances
  const courseInstancesPath = path.join(coursePath, 'courseInstances');
  await fs.ensureDir(courseInstancesPath);
  for (const shortName of Object.keys(courseData.courseInstances)) {
    const courseInstance = courseData.courseInstances[shortName];
    // Handle nested course instances - split on '/' and use components to construct
    // the nested directory structure.
    const courseInstancePath = path.join(courseInstancesPath, ...shortName.split('/'));
    await fs.ensureDir(courseInstancePath);
    const courseInstanceInfoPath = path.join(courseInstancePath, 'infoCourseInstance.json');
    await fs.writeJSON(courseInstanceInfoPath, courseInstance.courseInstance);

    // Write all assessments for this course instance
    const assessmentsPath = path.join(courseInstancePath, 'assessments');
    await fs.ensureDir(assessmentsPath);
    for (const assessmentName of Object.keys(courseInstance.assessments)) {
      // Handle nested assessments - split on '/' and use components to construct
      // the nested directory structure.
      const assessmentPath = path.join(assessmentsPath, ...assessmentName.split('/'));
      await fs.ensureDir(assessmentPath);
      const assessmentInfoPath = path.join(assessmentPath, 'infoAssessment.json');
      await fs.writeJSON(assessmentInfoPath, courseInstance.assessments[assessmentName]);
    }
  }
}

export const QUESTION_ID = 'test';
export const ALTERNATIVE_QUESTION_ID = 'test2';
export const MANUAL_GRADING_QUESTION_ID = 'test_manual';
export const WORKSPACE_QUESTION_ID = 'workspace';
export const COURSE_INSTANCE_ID = 'Fa19';

/** @type {Course} */
const course = {
  uuid: '5d14d80e-b0b8-494e-afed-f5a47497f5cb',
  name: 'TEST 101',
  title: 'Test Course',
  assessmentSets: [
    {
      name: 'TEST',
      abbreviation: 'Test',
      heading: 'Testing set',
      color: 'red1',
    },
    {
      name: 'ANOTHER TEST',
      abbreviation: 'Another Test',
      heading: 'Another testing set',
      color: 'red2',
    },
    {
      name: 'PRIVATE SET',
      abbreviation: 'Private',
      heading: 'Used by the default assessment, do not use in your own tests',
      color: 'red2',
    },
  ],
  assessmentModules: [
    {
      name: 'TEST',
      heading: 'Test module',
    },
  ],
  topics: [
    {
      name: 'Test',
      color: 'gray1',
      description: 'A test topic',
    },
    {
      name: 'Another test',
      color: 'gray2',
      description: 'Another test topic',
    },
  ],
  tags: [
    {
      name: 'test',
      color: 'blue1',
      description: 'A test tag',
    },
    {
      name: 'another test',
      color: 'blue2',
      description: 'Another test tag',
    },
  ],
};

/** @type {{ [id: string]: Question }} */
const questions = {
  private: {
    uuid: 'aff9236d-4f40-41fb-8c34-f97aed016535',
    title: 'Test question',
    topic: 'Test',
    tags: ['test'],
    type: 'v3',
  },
  [QUESTION_ID]: {
    uuid: 'f4ff2429-926e-4358-9e1f-d2f377e2036a',
    title: 'Test question',
    topic: 'Test',
    tags: ['test'],
    type: 'v3',
  },
  [ALTERNATIVE_QUESTION_ID]: {
    uuid: '697a6188-8215-4806-92a1-592987342b9e',
    title: 'Another test question',
    topic: 'Test',
    tags: ['test'],
    type: 'Calculation',
  },
  [MANUAL_GRADING_QUESTION_ID]: {
    uuid: '2798b1ba-06e0-4ddf-9e5d-765fcca08a46',
    title: 'Test question',
    topic: 'Test',
    gradingMethod: 'Manual',
    tags: ['test'],
    type: 'v3',
  },
  [WORKSPACE_QUESTION_ID]: {
    uuid: '894927f7-19b3-451d-8ad1-75974ad2ffb7',
    title: 'Workspace test question',
    topic: 'Workspace',
    tags: ['workspace'],
    type: 'v3',
    workspaceOptions: {
      image: 'prairielearn/workspace-vscode',
      port: 8080,
      home: '/home/coder',
      args: '--auth none',
      gradedFiles: ['animal.h', 'animal.c'],
    },
  },
};

/** @type {{ [id: string]: CourseInstanceData }} */
const courseInstances = {
  [COURSE_INSTANCE_ID]: {
    assessments: {
      test: {
        uuid: '73432669-2663-444e-ade5-43f689a50dea',
        title: 'Test assessment',
        type: 'Exam',
        set: 'PRIVATE SET',
        number: '100',
        allowAccess: [
          {
            mode: 'Exam',
          },
        ],
        zones: [
          {
            title: 'zone 1',
            questions: [
              {
                points: 10,
                alternatives: [{ id: 'private' }],
              },
            ],
          },
        ],
      },
    },
    courseInstance: {
      uuid: 'a17b1abd-eaf6-45dc-99bc-9890a7fb345e',
      longName: 'Testing instance',
      allowAccess: [
        {
          startDate: '2019-01-14T00:00:00',
          endDate: '2019-05-15T00:00:00',
        },
      ],
    },
  },
};

/**
 * @returns {CourseData} - The base course data for syncing testing
 */
export function getCourseData() {
  // Round-trip through JSON.stringify to ensure that mutations to nested
  // objects aren't reflected in the original objects.
  const courseData = {
    course,
    questions,
    courseInstances,
  };
  return JSON.parse(JSON.stringify(courseData));
}

export function getFakeLogger() {
  return {
    verbose: () => {},
    debug: () => {},
    info: () => {},
    warn: () => {},
  };
}

/**
 * Async wrapper for syncing course data from a directory. Also stubs out the
 * logger interface.
 *
 * @param {string} courseDir - The path to the course directory
 */
export async function syncCourseData(courseDir) {
  const logger = getFakeLogger();
  await promisify(syncFromDisk.syncOrCreateDiskToSql)(courseDir, logger);
}

export async function createAndSyncCourseData() {
  const courseData = getCourseData();
  const courseDir = await writeCourseToTempDirectory(courseData);
  await syncCourseData(courseDir);

  return {
    courseData,
    courseDir,
  };
}

/**
 * Writes the given course data to a new temporary directory and returns the
 * path to the directory.
 *
 * @param {CourseData} courseData - The course data to write and sync
 * @returns {Promise<string>} the path to the new temp directory
 */
export async function writeAndSyncCourseData(courseData) {
  const courseDir = await writeCourseToTempDirectory(courseData);
  await syncCourseData(courseDir);
  return courseDir;
}

/**
 * Overwrites the course data in the given directory and
 *
 * @param {CourseData} courseData - The course data write and sync
 * @param {string} courseDir - The path to write the course data to
 */
export async function overwriteAndSyncCourseData(courseData, courseDir) {
  await writeCourseToDirectory(courseData, courseDir);
  await syncCourseData(courseDir);
}

/**
 * Returns an array of all records in a particular database table.
 *
 * @param {string} tableName - The name of the table to query
 * @return {Promise<Record<string, any>[]>} - The rows of the given table
 */
export async function dumpTable(tableName) {
  const res = await sqldb.queryAsync(`SELECT * FROM ${tableName};`, {});
  return res.rows;
}

export async function captureDatabaseSnapshot() {
  return {
    courseInstances: await dumpTable('course_instances'),
    assessments: await dumpTable('assessments'),
    assessmentSets: await dumpTable('assessment_sets'),
    topics: await dumpTable('topics'),
    tags: await dumpTable('tags'),
    courseInstanceAccessRules: await dumpTable('course_instance_access_rules'),
    assessmentAccessRules: await dumpTable('assessment_access_rules'),
    zones: await dumpTable('zones'),
    alternativeGroups: await dumpTable('alternative_groups'),
    assessmentQuestions: await dumpTable('assessment_questions'),
    questions: await dumpTable('questions'),
    questionTags: await dumpTable('question_tags'),
    users: await dumpTable('users'),
    enrollments: await dumpTable('enrollments'),
  };
}

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
 * @param {string[]} [ignoredKeys=[]] An optional list of keys to ignore
 */
export function assertSnapshotsMatch(snapshotA, snapshotB, ignoredKeys = []) {
  // Sanity check - make sure both snapshots have the same keys
  assert(
    checkSetsSame(new Set(Object.keys(snapshotA)), new Set(Object.keys(snapshotB))),
    'snapshots contained different keys',
  );
  for (const key of Object.keys(snapshotA)) {
    if (ignoredKeys.indexOf(key) !== -1) continue;
    // Build a set of deterministically-stringified rows for each snapshot
    const setA = new Set(snapshotA[key].map((s) => stringify(s)));
    const setB = new Set(snapshotB[key].map((s) => stringify(s)));
    assert(checkSetsSame(setA, setB), `Snapshot of ${key} did not match`);
  }
}

/**
 * Asserts that `snapshotA` is a subset of `snapshotB` using the same algorithm
 * from `assertSnapshotsMatch`.
 *
 * @param {{ [key: string]: any[] }} snapshotA - The first snapshot
 * @param {{ [key: string]: any[] }} snapshotB - The second snapshot
 * @param {string[]} [ignoredKeys=[]] An optional list of keys to ignore
 */
export function assertSnapshotSubset(snapshotA, snapshotB, ignoredKeys = []) {
  // Sanity check - make sure both snapshots have the same keys
  assert(
    checkSetsSame(new Set(Object.keys(snapshotA)), new Set(Object.keys(snapshotB))),
    'snapshots contained different keys',
  );
  for (const key of Object.keys(snapshotA)) {
    if (ignoredKeys.indexOf(key) !== -1) continue;
    // Build a set of deterministically-stringified rows for each snapshot
    const setA = new Set(snapshotA[key].map((s) => stringify(s)));
    const setB = new Set(snapshotB[key].map((s) => stringify(s)));
    assert(
      [...setA].every((entry) => setB.has(entry)),
      `Snapshot of ${key} is not a subset`,
    );
  }
}
