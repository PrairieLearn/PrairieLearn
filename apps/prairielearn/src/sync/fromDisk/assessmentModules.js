// @ts-check
const sqldb = require('@prairielearn/postgres');
const infofile = require('../infofile');

const perf = require('../performance')('assessmentModules');

/**
 * @param {any} courseId
 * @param {import('../course-db').CourseData} courseData
 */
module.exports.sync = async function (courseId, courseData) {
  // We can only safely remove unused assessment modules if both `infoCourse.json`
  // and all `infoAssessment.json` files are valid.
  const isInfoCourseValid = !infofile.hasErrors(courseData.course);
  const areAllInfoAssessmentsValid = Object.values(courseData.courseInstances).every((ci) => {
    return Object.values(ci.assessments).every((a) => !infofile.hasErrors(a));
  });
  const deleteUnused = isInfoCourseValid && areAllInfoAssessmentsValid;

  /** @type {string[]} */
  let courseAssessmentModules = [];
  if (!infofile.hasErrors(courseData.course)) {
    courseAssessmentModules = (courseData.course.data?.assessmentModules ?? []).map((u) =>
      JSON.stringify([u.name, u.heading]),
    );
  }

  /** @type Set<string> */
  const knownAssessmentModuleNames = new Set();
  Object.values(courseData.courseInstances).forEach((ci) => {
    Object.values(ci.assessments).forEach((a) => {
      if (!infofile.hasErrors(a) && a.data?.module !== undefined) {
        knownAssessmentModuleNames.add(a.data.module);
      }
    });
  });
  const assessmentModuleNames = [...knownAssessmentModuleNames];

  const params = [
    isInfoCourseValid,
    deleteUnused,
    courseAssessmentModules,
    assessmentModuleNames,
    courseId,
  ];

  perf.start('sproc:sync_assessment_modules');
  await sqldb.callOneRowAsync('sync_assessment_modules', params);
  perf.end('sproc:sync_assessment_modules');
};
