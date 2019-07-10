const fs = require('fs-extra');
const tmp = require('tmp-promise');
const path = require('path');

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
module.exports.writeCourseToDisk = async function(courseData) {
  const { path: coursePath } = await tmp.dir({ unsafeCleanup: true });

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

  return coursePath;
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
