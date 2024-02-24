// @ts-check
import * as sqldb from '@prairielearn/postgres';

import * as infofile from '../infofile';
import { makePerformance } from '../performance';

const perf = makePerformance('assessmentSets');

/**
 * @param {any} courseId
 * @param {import('../course-db').CourseData} courseData
 */
export async function sync(courseId, courseData) {
  // We can only safely remove unused assessment sets if both `infoCourse.json`
  // and all `infoAssessment.json` files are valid.
  const isInfoCourseValid = !infofile.hasErrors(courseData.course);
  const areAllInfoAssessmentsValid = Object.values(courseData.courseInstances).every((ci) => {
    return Object.values(ci.assessments).every((a) => !infofile.hasErrors(a));
  });
  const deleteUnused = isInfoCourseValid && areAllInfoAssessmentsValid;

  /** @type {string[]} */
  let courseAssessmentSets = [];
  if (!infofile.hasErrors(courseData.course)) {
    courseAssessmentSets = (courseData.course.data?.assessmentSets ?? []).map((t) =>
      JSON.stringify([t.name, t.abbreviation, t.heading, t.color]),
    );
  }

  /** @type Set<string> */
  const knownAssessmentSetNames = new Set();
  Object.values(courseData.courseInstances).forEach((ci) => {
    Object.values(ci.assessments).forEach((a) => {
      if (!infofile.hasErrors(a) && a.data?.set) {
        knownAssessmentSetNames.add(a.data.set);
      }
    });
  });
  const assessmentSetNames = [...knownAssessmentSetNames];

  const params = [
    isInfoCourseValid,
    deleteUnused,
    courseAssessmentSets,
    assessmentSetNames,
    courseId,
  ];

  perf.start('sproc:sync_assessment_sets');
  await sqldb.callOneRowAsync('sync_assessment_sets', params);
  perf.end('sproc:sync_assessment_sets');
}
