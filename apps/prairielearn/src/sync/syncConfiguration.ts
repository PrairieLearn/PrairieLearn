import { config } from '../lib/config.js';
import type { Course } from '../lib/db-types.js';
import { features } from '../lib/features/index.js';
import { selectInstitutionForCourse } from '../models/institution.js';
import { CourseJsonSchema } from '../schemas/index.js';

import { loadInfoFile } from './course-db.js';

// Bump when unchanged course files can produce different metadata or diagnostics.
const SYNC_VERSION = 1;

/** Includes external inputs that can change persisted metadata or sync diagnostics. */
export async function getSyncConfiguration(course: Pick<Course, 'id' | 'path'>) {
  const institution = await selectInstitutionForCourse({ course_id: course.id });
  const context = { course_id: course.id, institution_id: institution.id };
  const info = await loadInfoFile<unknown>({
    coursePath: course.path,
    filePath: 'infoCourse.json',
  });
  const parsed = CourseJsonSchema.safeParse(info?.data);
  const declarations = parsed.success ? (parsed.data.options.devModeFeatures ?? {}) : {};
  const declaredNames = Array.isArray(declarations) ? declarations : Object.keys(declarations);
  const names = new Set(['question-sharing', 'consume-public-questions', ...declaredNames]);
  const enabledFeatures: Record<string, boolean> = {};
  const unknownFeatures: string[] = [];
  await Promise.all(
    [...names].sort().map(async (name) => {
      if (features.hasFeature(name)) {
        enabledFeatures[name] = await features.enabled(name, context);
      } else {
        unknownFeatures.push(name);
      }
    }),
  );
  return {
    version: SYNC_VERSION,
    features: enabledFeatures,
    unknownFeatures: unknownFeatures.sort(),
    checkSharingOnSync: config.checkSharingOnSync,
    checkAccessRulesExamUuid: config.checkAccessRulesExamUuid,
    checkInstitutionsOnSync: config.checkInstitutionsOnSync,
    externalGradingMaximumTimeout: config.externalGradingMaximumTimeout,
    devMode: config.devMode,
    chunksGenerator: config.chunksGenerator,
  };
}
