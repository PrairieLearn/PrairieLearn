import { execute, loadSqlEquiv } from '@prairielearn/postgres';

import { TEST_COURSE_PATH } from '../lib/paths.js';
import * as syncFromDisk from '../sync/syncFromDisk.js';

import { makeMockLogger } from './mockLogger.js';

const sql = loadSqlEquiv(import.meta.url);

export async function syncCourse(courseDir = TEST_COURSE_PATH) {
  const { logger, getOutput } = makeMockLogger();
  const syncResult = await syncFromDisk.syncOrCreateDiskToSql(courseDir, logger);
  if (syncResult.status === 'sharing_error' || syncResult.hadJsonErrorsOrWarnings) {
    console.log(getOutput());
    throw new Error(`Errors or warnings found during sync of ${courseDir}`);
  }
}

export async function updateCourseRepo({
  courseId,
  repository,
}: {
  courseId: string;
  repository: string;
}) {
  await execute(sql.update_course_repo, { courseId, repository });
}
