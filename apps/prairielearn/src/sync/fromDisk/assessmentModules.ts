import * as sqldb from '@prairielearn/postgres';

import { type CourseData } from '../course-db.js';
import * as infofile from '../infofile.js';

export async function sync(courseId: string, courseData: CourseData) {
  // We can only safely remove unused assessment modules if both `infoCourse.json`
  // and all `infoAssessment.json` files are valid.
  const isInfoCourseValid = !infofile.hasErrors(courseData.course);
  const areAllInfoAssessmentsValid = Object.values(courseData.courseInstances).every((ci) => {
    return Object.values(ci.assessments).every((a) => !infofile.hasErrors(a));
  });
  const deleteUnused = isInfoCourseValid && areAllInfoAssessmentsValid;

  let courseAssessmentModules: string[] = [];
  if (!infofile.hasErrors(courseData.course)) {
    courseAssessmentModules = (courseData.course.data?.assessmentModules ?? []).map((u) =>
      JSON.stringify([u.name, u.heading]),
    );
  }

  const knownAssessmentModuleNames = new Set<string>();
  Object.values(courseData.courseInstances).forEach((ci) => {
    Object.values(ci.assessments).forEach((a) => {
      if (!infofile.hasErrors(a) && a.data?.module !== undefined) {
        knownAssessmentModuleNames.add(a.data.module);
      }
    });
  });
  const assessmentModuleNames = [...knownAssessmentModuleNames];

  await sqldb.callOneRowAsync('sync_assessment_modules', [
    isInfoCourseValid,
    deleteUnused,
    courseAssessmentModules,
    assessmentModuleNames,
    courseId,
  ]);
}
