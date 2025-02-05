import { callOneRowAsync } from '@prairielearn/postgres';

import { type CourseData } from '../course-db.js';
import * as infofile from '../infofile.js';

export async function sync(courseId: string, courseData: CourseData) {
  // We can only safely remove unused assessment sets if both `infoCourse.json`
  // and all `infoAssessment.json` files are valid.
  const isInfoCourseValid = !infofile.hasErrors(courseData.course);
  const areAllInfoAssessmentsValid = Object.values(courseData.courseInstances).every((ci) => {
    return Object.values(ci.assessments).every((a) => !infofile.hasErrors(a));
  });
  const deleteUnused = isInfoCourseValid && areAllInfoAssessmentsValid;

  let courseAssessmentSets: string[] = [];
  if (!infofile.hasErrors(courseData.course)) {
    courseAssessmentSets = (courseData.course.data?.assessmentSets ?? []).map((t) =>
      JSON.stringify([t.name, t.abbreviation, t.heading, t.color]),
    );
  }

  if (!deleteUnused) {
    // Make sure we have the "Unknown" assessment set, because
    // we will use this as a last resort for assessments.
    const assessmentSetsContainsUnknown = (courseData.course.data?.assessmentSets ?? []).some(
      (t) => t.name === 'Unknown',
    );
    if (!assessmentSetsContainsUnknown) {
      courseAssessmentSets.push(JSON.stringify(['Unknown', 'U', 'Unknown', 'red3']));
    }
  }

  const knownAssessmentSetNames = new Set<string>();
  Object.values(courseData.courseInstances).forEach((ci) => {
    Object.values(ci.assessments).forEach((a) => {
      if (!infofile.hasErrors(a) && a.data?.set) {
        knownAssessmentSetNames.add(a.data.set);
      }
    });
  });

  const assessmentSetNames = [...knownAssessmentSetNames];

  await callOneRowAsync('sync_assessment_sets', [
    isInfoCourseValid,
    deleteUnused,
    courseAssessmentSets,
    assessmentSetNames,
    courseId,
  ]);
}
