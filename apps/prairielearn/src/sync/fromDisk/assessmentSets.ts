import { loadSqlEquiv, queryAsync, queryRows, runInTransactionAsync } from '@prairielearn/postgres';

import { AssessmentSetSchema } from '../../lib/db-types.js';
import { type CourseData } from '../course-db.js';
import * as infofile from '../infofile.js';

import { determineOperationsForEntities } from './entity-list.js';

const sql = loadSqlEquiv(import.meta.url);

interface DesiredAssessmentSet {
  name: string;
  abbreviation: string;
  heading: string;
  color: string;
}

export async function sync(courseId: string, courseData: CourseData) {
  // We can only safely remove unused assessment sets if both `infoCourse.json`
  // and all `infoAssessment.json` files are valid.
  const isInfoCourseValid = !infofile.hasErrors(courseData.course);
  const areAllInfoAssessmentsValid = Object.values(courseData.courseInstances).every((ci) => {
    return Object.values(ci.assessments).every((a) => !infofile.hasErrors(a));
  });
  const deleteUnused = isInfoCourseValid && areAllInfoAssessmentsValid;

  const knownAssessmentSetNames = new Set<string>();
  Object.values(courseData.courseInstances).forEach((ci) => {
    Object.values(ci.assessments).forEach((a) => {
      if (!infofile.hasErrors(a) && a.data?.set) {
        knownAssessmentSetNames.add(a.data.set);
      }
    });
  });

  const existingAssessmentSets = await queryRows(
    sql.select_assessment_sets,
    { course_id: courseId },
    AssessmentSetSchema,
  );

  // Based on the set of desired assessment sets, determine which ones must be
  // added, updated, or deleted.
  const {
    entitiesToCreate: assessmentSetsToCreate,
    entitiesToUpdate: assessmentSetsToUpdate,
    entitiesToDelete: assessmentSetsToDelete,
  } = determineOperationsForEntities<DesiredAssessmentSet>({
    courseEntities: courseData.course.data?.assessmentSets ?? [],
    // Make sure we have the "Unknown" assessment set, because
    // we will use this as a last resort for assessments.
    //
    // We only create this if we have invalid JSON somewhere. If all the JSON
    // is valid, we're guaranteed not to need this.
    extraEntities: !deleteUnused
      ? [
          {
            name: 'Unknown',
            abbreviation: 'U',
            heading: 'Unknown',
            color: 'red3',
            implicit: true,
          },
        ]
      : [],
    existingEntities: existingAssessmentSets,
    knownNames: knownAssessmentSetNames,
    makeImplicitEntity: (name) => ({
      name,
      abbreviation: name,
      heading: `${name} (Auto-generated from use in an assessment; add this assessment set to your infoCourse.json file to customize)`,
      color: 'gray1',
      implicit: true,
    }),
    comparisonProperties: ['abbreviation', 'heading', 'color'],
    isInfoCourseValid,
    deleteUnused,
  });

  if (
    assessmentSetsToCreate.length ||
    assessmentSetsToUpdate.length ||
    assessmentSetsToDelete.length
  ) {
    await runInTransactionAsync(async () => {
      if (assessmentSetsToCreate.length) {
        await queryAsync(sql.insert_assessment_sets, {
          course_id: courseId,
          sets: assessmentSetsToCreate.map((as) =>
            JSON.stringify([
              as.name,
              as.abbreviation,
              as.heading,
              as.color,
              as.number,
              as.implicit,
            ]),
          ),
        });
      }

      if (assessmentSetsToUpdate.length) {
        await queryAsync(sql.update_assessment_sets, {
          course_id: courseId,
          sets: assessmentSetsToUpdate.map((as) =>
            JSON.stringify([
              as.name,
              as.abbreviation,
              as.heading,
              as.color,
              as.number,
              as.implicit,
            ]),
          ),
        });
      }

      if (assessmentSetsToDelete.length) {
        await queryAsync(sql.delete_assessment_sets, {
          course_id: courseId,
          sets: assessmentSetsToDelete,
        });
      }
    });
  }
}
