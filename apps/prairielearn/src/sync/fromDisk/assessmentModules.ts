import { loadSqlEquiv, queryRows, queryAsync } from '@prairielearn/postgres';

import { AssessmentModuleSchema } from '../../lib/db-types.js';
import { type CourseData } from '../course-db.js';
import * as infofile from '../infofile.js';

const sql = loadSqlEquiv(import.meta.url);

interface DesiredAssessmentModule {
  name: string;
  // TODO: make non-nullable once we make this non-null in the database schema.
  heading: string | null;
  implicit: boolean;
  number: number;
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
  const existingAssessmentModuleNames = new Set(existingAssessmentModules.map((am) => am.name));

  const desiredAssessmentModules = new Map<string, DesiredAssessmentModule>();

  // If `infoCourse.json` is invalid, keep all existing assessment sets in place.
  // Otherwise, sync whatever is in the JSON file.
  if (isInfoCourseValid) {
    for (const module of courseData.course.data?.assessmentModules ?? []) {
      desiredAssessmentModules.set(module.name, {
        ...module,
        implicit: false,
        number: desiredAssessmentModules.size + 1,
      });
    }
  } else {
    for (const module of existingAssessmentModules) {
      desiredAssessmentModules.set(module.name, {
        ...module,
        number: desiredAssessmentModules.size + 1,
      });
    }
  }

  // Consider each module name that's actually used. If it doesn't already exist,
  // add an implicit version. Sort for consistent ordering.
  for (const name of Array.from(knownAssessmentModuleNames).sort()) {
    // Skip `Default`, we want this to be last to we'll handle it separately.
    if (name === 'Default') continue;

    if (desiredAssessmentModules.has(name)) continue;

    desiredAssessmentModules.set(name, {
      name,
      heading: `${name} (Auto-generated from use in an assessment; add this assessment module to your infoCourse.json file to customize)`,
      implicit: true,
      number: desiredAssessmentModules.size + 1,
    });
  }

  // Add a 'Default' module if one doesn't already exist.
  if (!desiredAssessmentModules.has('Default')) {
    desiredAssessmentModules.set('Default', {
      name: 'Default',
      heading: 'Default module',
      implicit: false,
      number: desiredAssessmentModules.size + 1,
    });
  }

  // Based on the set of desired assessment modules, determine which ones must be
  // added, updated, or deleted.
  const assessmentModulesToAdd = new Map<string, DesiredAssessmentModule>();
  const assessmentModulesToUpdate = new Map<string, DesiredAssessmentModule>();
  const assessmentModulesToDelete = new Set<string>();

  for (const [name, module] of desiredAssessmentModules) {
    if (existingAssessmentModuleNames.has(name)) {
      // TODO: check for equality, skip update if not needed.
      assessmentModulesToUpdate.set(name, module);
    } else {
      assessmentModulesToAdd.set(name, module);
    }
  }

  if (deleteUnused) {
    for (const name of existingAssessmentModuleNames) {
      if (!desiredAssessmentModules.has(name)) {
        assessmentModulesToDelete.add(name);
      }
    }
  }

  // TODO: wrap the following statements in a transaction?

  if (assessmentModulesToAdd.size) {
    await queryAsync(sql.insert_assessment_modules, {
      course_id: courseId,
      modules: Array.from(assessmentModulesToAdd.values()).map((am) =>
        JSON.stringify([am.name, am.heading, am.number, am.implicit]),
      ),
    });
  }

  if (assessmentModulesToUpdate.size) {
    await queryAsync(sql.update_assessment_modules, {
      course_id: courseId,
      modules: Array.from(assessmentModulesToUpdate.values()).map((am) =>
        JSON.stringify([am.name, am.heading, am.number, am.implicit]),
      ),
    });
  }

  if (assessmentModulesToDelete.size) {
    await queryAsync(sql.delete_assessment_modules, {
      course_id: courseId,
      modules: Array.from(assessmentModulesToDelete),
    });
  }
}
