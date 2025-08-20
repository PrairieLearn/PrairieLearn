import { execute, loadSqlEquiv, queryRows, runInTransactionAsync } from '@prairielearn/postgres';

import { AssessmentModuleSchema } from '../../lib/db-types.js';
import { type CourseData } from '../course-db.js';
import * as infofile from '../infofile.js';

import { determineOperationsForEntities } from './entity-list.js';

const sql = loadSqlEquiv(import.meta.url);

interface DesiredAssessmentModule {
  name: string;
  /** TODO: make non-nullable once we make this non-null in the database schema. */
  heading: string | null;
}

export async function sync(courseId: string, courseData: CourseData) {
  // We can only safely remove unused assessment modules if both `infoCourse.json`
  // and all `infoAssessment.json` files are valid.
  const isInfoCourseValid = !infofile.hasErrors(courseData.course);
  const areAllInfoAssessmentsValid = Object.values(courseData.courseInstances).every((ci) => {
    return Object.values(ci.assessments).every((a) => !infofile.hasErrors(a));
  });
  const deleteUnused = isInfoCourseValid && areAllInfoAssessmentsValid;

  const knownAssessmentModuleNames = new Set<string>();
  Object.values(courseData.courseInstances).forEach((ci) => {
    Object.values(ci.assessments).forEach((a) => {
      if (!infofile.hasErrors(a) && a.data?.module !== undefined) {
        knownAssessmentModuleNames.add(a.data.module);
      }
    });
  });

  const existingAssessmentModules = await queryRows(
    sql.select_assessment_modules,
    { course_id: courseId },
    AssessmentModuleSchema,
  );

  // Based on the set of desired assessment modules, determine which ones must be
  // added, updated, or deleted.
  const {
    entitiesToCreate: assessmentModulesToCreate,
    entitiesToUpdate: assessmentModulesToUpdate,
    entitiesToDelete: assessmentModulesToDelete,
  } = determineOperationsForEntities<DesiredAssessmentModule>({
    courseEntities: courseData.course.data?.assessmentModules ?? [],
    extraEntities: [
      {
        name: 'Default',
        heading: 'Default module',
        implicit: true,
      },
    ],
    existingEntities: existingAssessmentModules,
    knownNames: knownAssessmentModuleNames,
    makeImplicitEntity: (name) => ({
      name,
      heading: name,
      implicit: true,
    }),
    comparisonProperties: ['heading'],
    isInfoCourseValid,
    deleteUnused,
  });

  if (
    assessmentModulesToCreate.length > 0 ||
    assessmentModulesToUpdate.length > 0 ||
    assessmentModulesToDelete.length > 0
  ) {
    await runInTransactionAsync(async () => {
      if (assessmentModulesToCreate.length > 0) {
        await execute(sql.insert_assessment_modules, {
          course_id: courseId,
          modules: assessmentModulesToCreate.map((am) =>
            JSON.stringify([am.name, am.heading, am.number, am.implicit]),
          ),
        });
      }

      if (assessmentModulesToUpdate.length > 0) {
        await execute(sql.update_assessment_modules, {
          course_id: courseId,
          modules: assessmentModulesToUpdate.map((am) =>
            JSON.stringify([am.name, am.heading, am.number, am.implicit]),
          ),
        });
      }

      if (assessmentModulesToDelete.length > 0) {
        await execute(sql.delete_assessment_modules, {
          course_id: courseId,
          modules: assessmentModulesToDelete,
        });
      }
    });
  }
}
