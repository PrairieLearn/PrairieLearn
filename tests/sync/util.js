const fs = require('fs-extra');
const tmp = require('tmp-promise');
const path = require('path');

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
