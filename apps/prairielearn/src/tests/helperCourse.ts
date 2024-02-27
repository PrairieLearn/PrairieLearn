import { TEST_COURSE_PATH } from '../lib/paths';
import * as syncFromDisk from '../sync/syncFromDisk';
import { makeMockLogger } from './mockLogger';

export async function syncCourse(courseDir = TEST_COURSE_PATH) {
  const { logger, getOutput } = makeMockLogger();
  const result = await syncFromDisk.syncOrCreateDiskToSql(courseDir, logger);
  if (!result || result.hadJsonErrorsOrWarnings) {
    console.log(getOutput());
    throw new Error(`Errors or warnings found during sync of ${courseDir}`);
  }
}
