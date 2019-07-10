const fs = require('fs-extra');
const tmp = require('tmp-promise');
const path = require('path');
const sqldb = require('@prairielearn/prairielib/sql-db');

const syncFromDisk = require('../../sync/syncFromDisk');

module.exports.course = {
  course: {
    uuid: '1234',
  },
  questions: {
    qid: {
      uuid: '1234',
    },
    qid2: {
      uuid: '4321',
    },
  },
  courseInstances: {
    sp15: {
      assessments: {
        exam1: {
          uuid: '1423',
        },
      },
      courseInstance: {
        uuid: '4321',
      },
    },
  },
};

/** @typedef {{ assessments: object, courseInstance: object }} CourseInstanceData */
/** @typedef {{ course: object, questions: { [id: string]: object }, courseInstances: { [id: string]: CourseInstanceData } }} CourseData */

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
    for (const assessmentName of Object.keys(courseInstance.assessments)) {
      const assessmentPath = path.join(courseInstancePath, assessmentName);
      await fs.ensureDir(assessmentPath);
      const assessmentInfoPath = path.join(assessmentPath, 'infoAssessment.json');
      await fs.writeJSON(assessmentInfoPath, courseInstance.assessments[assessmentName]);
    }
  }
};

const course = {
  uuid: '5d14d80e-b0b8-494e-afed-f5a47497f5cb',
  name: 'TEST 101',
  title: 'Test Course',
  assessmentSets: [],
  topics: [{
    name: 'Test',
    color: 'gray3',
    description: 'A test topic',
  }],
  tags: [{
    name: 'test',
    color: 'blue1',
    description: 'A test tag',
  }],
};

const questions = {
  test: {
    uuid: 'f4ff2429-926e-4358-9e1f-d2f377e2036a',
    title: 'Test question',
    topic: 'Test',
    tags: ['test'],
    type: 'v3',
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
    courseInstances: {},
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

module.exports.writeAndSyncCourseData = async function(courseData, coursePath) {
  await this.writeCourseToDirectory(courseData, coursePath);
  await this.syncCourseData(coursePath);
}

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
  };
};
