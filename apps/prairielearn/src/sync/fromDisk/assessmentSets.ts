import { z } from 'zod';

import { callOneRowAsync, queryRow, queryAsync, loadSqlEquiv } from '@prairielearn/postgres';

import { type CourseData } from '../course-db.js';
import * as infofile from '../infofile.js';

const sql = loadSqlEquiv(import.meta.url);

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

  const knownAssessmentSetNames = new Set<string>();
  Object.values(courseData.courseInstances).forEach((ci) => {
    Object.values(ci.assessments).forEach((a) => {
      if (!infofile.hasErrors(a) && a.data?.set) {
        knownAssessmentSetNames.add(a.data.set);
      }
    });
  });
  const assessmentSetNames = [...knownAssessmentSetNames];

  // Make sure we have the "Unknown" assessment set, because
  // we will use this as a last resort for assessments.

  const unknownSetExists = await queryRow(
    sql.unknown_set_exists,
    {
      course_id: courseId,
    },
    z.boolean(),
  );

  if (!unknownSetExists) {
    await queryAsync(sql.create_unknown_set, {
      course_id: courseId,
    });
  }

  await callOneRowAsync('sync_assessment_sets', [
    isInfoCourseValid,
    deleteUnused,
    courseAssessmentSets,
    assessmentSetNames,
    courseId,
  ]);
}
