import * as fs from 'fs-extra';
import * as tmp from 'tmp-promise';
import * as path from 'path';
import * as sqldb from '@prairielearn/postgres';
import stringify = require('json-stable-stringify');
import { assert } from 'chai';

import * as syncFromDisk from '../../sync/syncFromDisk';

interface CourseOptions {
  useNewQuestionRenderer: boolean;
  devModeFeatures: string[];
}

interface Tag {
  name: string;
  color: string;
  description: string;
}

interface Topic {
  name: string;
  color: string;
  description: string;
}

export interface AssessmentSet {
  abbreviation: string;
  name: string;
  heading: string;
  color: string;
}

interface Module {
  name: string;
  heading: string;
}

interface Course {
  uuid: string;
  name: string;
  title: string;
  timezone?: string;
  options?: CourseOptions;
  tags: Tag[];
  topics: Topic[];
  assessmentSets: AssessmentSet[];
  assessmentModules?: Module[];
}

interface CourseInstanceAllowAccess {
  uids?: string[];
  startDate?: string;
  endDate?: string;
  institution?: string;
}

interface CourseInstance {
  uuid: string;
  longName: string;
  number?: number;
  timezone?: string;
  allowAccess?: CourseInstanceAllowAccess[];
  groupAssessmentsBy?: 'Set' | 'Module';
}

export interface GroupRole {
  name: string;
  minimum?: number;
  maximum?: number;
  canAssignRoles?: boolean;
}

interface SEBConfig {
  password: string;
  quitPassword: string;
  allowPrograms: string[];
}

interface AssessmentAllowAccess {
  mode?: 'Public' | 'Exam' | 'SEB';
  examUuid?: string;
  uids?: string[];
  credit?: number;
  startDate?: string;
  endDate?: string;
  timeLimitMin?: number;
  password?: string;
  SEBConfig?: SEBConfig;
  active?: boolean;
}

interface QuestionAlternative {
  points?: number | number[];
  autoPoints?: number | number[];
  maxPoints?: number;
  maxAutoPoints?: number;
  manualPoints?: number;
  id?: string;
  forceMaxPoints?: boolean;
  triesPerVariant?: number;
}

interface ZoneQuestion {
  points?: number | number[];
  autoPoints?: number | number[];
  maxPoints?: number;
  maxAutoPoints?: number;
  manualPoints?: number;
  id?: string;
  forceMaxPoints?: boolean;
  alternatives?: QuestionAlternative[];
  numberChoose?: number;
  triesPerVariant?: number;
  canSubmit?: string[];
  canView?: string[];
}

interface Zone {
  title?: string;
  maxPoints?: number;
  maxChoose?: number;
  bestQuestions?: number;
  questions?: ZoneQuestion[];
  canSubmit?: string[];
  canView?: string[];
}

export interface Assessment {
  uuid: string;
  type: 'Homework' | 'Exam';
  title: string;
  set: string;
  module?: string;
  number: string;
  groupRoles?: GroupRole[];
  allowIssueReporting?: boolean;
  allowRealTimeGrading?: boolean;
  requireHonorCode?: boolean;
  multipleInstance?: boolean;
  shuffleQuestions?: boolean;
  allowAccess?: AssessmentAllowAccess[];
  text?: string;
  maxPoints?: number;
  autoClose?: boolean;
  zones?: Zone[];
  constantQuestionValue?: boolean;
  groupWork?: boolean;
  groupMaxSize?: number;
  groupMinSize?: number;
  studentGroupCreate?: boolean;
  studentGroupJoin?: boolean;
  studentGroupLeave?: boolean;
  hasRoles?: boolean;
  canSubmit?: string[];
  canView?: string[];
}

interface QuestionExternalGradingOptions {
  enabled?: boolean;
  image: string;
  entrypoint: string;
  serverFilesCourse?: string[];
  timeout?: number;
  enableNetworking?: boolean;
  environment?: Record<string, string | null>;
}

interface QuestionWorkspaceOptions {
  image: string;
  port: number;
  home: string;
  args?: string;
  gradedFiles?: string[];
  rewriteUrl?: string;
  enableNetworking?: boolean;
  environment?: Record<string, string | null>;
}

export interface Question {
  uuid: string;
  type: 'Calculation' | 'MultipleChoice' | 'Checkbox' | 'File' | 'MultipleTrueFalse' | 'v3';
  title: string;
  topic: string;
  tags?: string[];
  clientFiles?: string[];
  clientTemplates?: string[];
  template?: string;
  gradingMethod?: 'Internal' | 'External' | 'Manual';
  singleVariant?: boolean;
  showCorrectAnswer?: boolean;
  partialCredit?: boolean;
  options?: Record<string, unknown>;
  externalGradingOptions?: QuestionExternalGradingOptions;
  workspaceOptions?: QuestionWorkspaceOptions;
}

export interface CourseInstanceData {
  assessments: Record<string, Assessment>;
  courseInstance: CourseInstance;
}

export interface CourseData {
  course: Course;
  questions: Record<string, Question>;
  courseInstances: Record<string, CourseInstanceData>;
}

/**
 * Accepts a CourseData object and creates a PrairieLearn course directory
 * structure from it. Returns the path to the newly-created directory.
 *
 * @param courseData - The course data to write to disk
 * @returns The path to the directory containing the course data
 */
export async function writeCourseToTempDirectory(courseData: CourseData): Promise<string> {
  const { path: coursePath } = await tmp.dir({ unsafeCleanup: true });
  await writeCourseToDirectory(courseData, coursePath);
  return coursePath;
}

/**
 * Accepts a CourseData object and writes it as a PrairieLearn course
 * into the given directory. Removes any existing content from the
 * directory.
 *
 * @param courseData - The course data to write to disk
 * @param coursePath - The path to the directory to write to
 */
export async function writeCourseToDirectory(courseData: CourseData, coursePath: string) {
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
export const ASSESSMENT_ID = 'test';

const course: Course = {
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

const questions: Record<string, Question> = {
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

const courseInstances: Record<string, CourseInstanceData> = {
  [COURSE_INSTANCE_ID]: {
    assessments: {
      [ASSESSMENT_ID]: {
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
 * @returns The base course data for syncing testing
 */
export function getCourseData(): CourseData {
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
 * @param courseDir - The path to the course directory
 */
export async function syncCourseData(courseDir: string) {
  const logger = getFakeLogger();
  return await syncFromDisk.syncOrCreateDiskToSql(courseDir, logger);
}

export async function createAndSyncCourseData() {
  const courseData = getCourseData();
  const courseDir = await writeCourseToTempDirectory(courseData);
  const syncResults = await syncCourseData(courseDir);

  return {
    courseData,
    courseDir,
    syncResults,
  };
}

/**
 * Writes the given course data to a new temporary directory and returns the
 * path to the directory.
 *
 * @param courseData - The course data to write and sync
 * @returns The path to the new temp directory and the sync results
 */
export async function writeAndSyncCourseData(courseData: CourseData): Promise<{
  courseDir: string;
  syncResults: syncFromDisk.SyncResults;
}> {
  const courseDir = await writeCourseToTempDirectory(courseData);
  const syncResults = await syncCourseData(courseDir);
  return { courseDir, syncResults };
}

/**
 * Overwrites the course data in the given directory and
 *
 * @param courseData - The course data write and sync
 * @param courseDir - The path to write the course data to
 */
export async function overwriteAndSyncCourseData(courseData: CourseData, courseDir: string) {
  await writeCourseToDirectory(courseData, courseDir);
  await syncCourseData(courseDir);
}

/**
 * Returns an array of all records in a particular database table.
 *
 * @param tableName - The name of the table to query
 * @return The rows of the given table
 */
export async function dumpTable(tableName: string): Promise<Record<string, any>[]> {
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
 * @returns The union of setA and setB
 */
function setUnion<T>(setA: Set<T>, setB: Set<T>) {
  return new Set([...setA, ...setB]);
}

/**
 * Checks if two sets contain the same elements.
 *
 * @returns Whether or not the sets contain the same elements.
 */
function checkSetsSame<T>(setA: Set<T>, setB: Set<T>) {
  const union = setUnion(setA, setB);
  return setA.size === setB.size && union.size === setA.size;
}

/**
 * Asserts that two snapshots match each other. Two snapshots are defined as
 * matching if they both contain the same keys and if for each key, the array
 * of values contains the same elements. Elements may be in different orders.
 * Optionally, a subset of the keys in the snapshot can be ignored.
 *
 * @param snapshotA - The first snapshot
 * @param snapshotB - The second snapshot
 * @param ignoredKeys - An optional list of keys to ignore
 */
export function assertSnapshotsMatch(
  snapshotA: Record<string, any[]>,
  snapshotB: Record<string, any[]>,
  ignoredKeys: string[] = [],
) {
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
 * @param snapshotA - The first snapshot
 * @param snapshotB - The second snapshot
 * @param ignoredKeys - An optional list of keys to ignore
 */
export function assertSnapshotSubset(
  snapshotA: Record<string, any[]>,
  snapshotB: Record<string, any>,
  ignoredKeys: string[] = [],
) {
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
