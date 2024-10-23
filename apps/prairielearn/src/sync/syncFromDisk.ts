import async from 'async';

import * as namedLocks from '@prairielearn/named-locks';

import { chalk, chalkDim } from '../lib/chalk.js';
import { config } from '../lib/config.js';
import { type ServerJobLogger } from '../lib/server-jobs.js';
import { getLockNameForCoursePath, selectOrInsertCourseByPath } from '../models/course.js';
import { flushElementCache } from '../question-servers/freeform.js';

import * as courseDB from './course-db.js';
import * as syncAssessmentModules from './fromDisk/assessmentModules.js';
import * as syncAssessmentSets from './fromDisk/assessmentSets.js';
import * as syncAssessments from './fromDisk/assessments.js';
import * as syncCourseInfo from './fromDisk/courseInfo.js';
import * as syncCourseInstances from './fromDisk/courseInstances.js';
import * as syncQuestions from './fromDisk/questions.js';
import * as syncSharingSets from './fromDisk/sharing.js';
import * as syncTags from './fromDisk/tags.js';
import * as syncTopics from './fromDisk/topics.js';
import {
  selectSharedQuestions,
  getInvalidRenames,
  checkInvalidSharingSetRemovals,
  checkInvalidPublicSharingRemovals,
  checkInvalidSharingSetDeletions,
  checkInvalidSharingSetAdditions,
} from './sharing.js';

interface SyncResultSharingError {
  status: 'sharing_error';
  courseId: string;
}

interface SyncResultComplete {
  status: 'complete';
  hadJsonErrors: boolean;
  hadJsonErrorsOrWarnings: boolean;
  courseId: string;
  courseData: courseDB.CourseData;
}

export type SyncResults = SyncResultSharingError | SyncResultComplete;

export async function checkSharingConfigurationValid(
  courseId: string,
  courseData: courseDB.CourseData,
  logger: ServerJobLogger,
): Promise<boolean> {
  if (!config.checkSharingOnSync) {
    return true;
  }

  const sharedQuestions = await selectSharedQuestions(courseId);
  const existInvalidRenames = getInvalidRenames(sharedQuestions, courseData, logger);
  const existInvalidPublicSharingRemovals = checkInvalidPublicSharingRemovals(
    sharedQuestions,
    courseData,
    logger,
  );
  const existInvalidSharingSetDeletions = await checkInvalidSharingSetDeletions(
    courseId,
    courseData,
    logger,
  );
  const existInvalidSharingSetAdditions = checkInvalidSharingSetAdditions(courseData, logger);
  const existInvalidSharingSetRemovals = await checkInvalidSharingSetRemovals(
    courseId,
    courseData,
    logger,
  );

  const sharingConfigurationValid =
    !existInvalidRenames &&
    !existInvalidPublicSharingRemovals &&
    !existInvalidSharingSetDeletions &&
    !existInvalidSharingSetAdditions &&
    !existInvalidSharingSetRemovals;
  return sharingConfigurationValid;
}

export async function syncDiskToSqlWithLock(
  courseId: string,
  courseDir: string,
  logger: ServerJobLogger,
  courseData?: courseDB.CourseData,
): Promise<SyncResults> {
  async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
    const start = performance.now();

    const result = await fn();

    const duration = performance.now() - start;
    logger.verbose(`${label} in ${duration.toFixed(2)}ms`);

    return result;
  }

  logger.info('Loading info.json files from course repository');

  if (!courseData) {
    courseData = await timed('Loaded course data from disk', () =>
      courseDB.loadFullCourse(courseId, courseDir),
    );
  }

  const sharingConfigurationValid = await timed('Validated sharing configuration', () =>
    checkSharingConfigurationValid(courseId, courseData, logger),
  );
  if (!sharingConfigurationValid) {
    return {
      status: 'sharing_error',
      courseId,
    };
  }

  logger.info('Syncing info to database');

  await timed('Synced all course data', async () => {
    await timed('Synced course info', () => syncCourseInfo.sync(courseData, courseId));
    const courseInstanceIds = await timed('Synced course instances', () =>
      syncCourseInstances.sync(courseId, courseData),
    );
    await timed('Synced topics', () => syncTopics.sync(courseId, courseData));
    const questionIds = await timed('Synced questions', () =>
      syncQuestions.sync(courseId, courseData),
    );

    await timed('Synced sharing sets', () =>
      syncSharingSets.sync(courseId, courseData, questionIds),
    );
    await timed('Synced tags', () => syncTags.sync(courseId, courseData, questionIds));
    await timed('Synced assessment sets', () => syncAssessmentSets.sync(courseId, courseData));
    await timed('Synced assessment modules', () =>
      syncAssessmentModules.sync(courseId, courseData),
    );
    await timed('Synced all assessments', async () => {
      // Ensure that a single course with a ton of course instances can't
      // monopolize the database connection pool.
      await async.eachLimit(
        Object.entries(courseData.courseInstances),
        3,
        async ([ciid, courseInstanceData]) => {
          const courseInstanceId = courseInstanceIds[ciid];
          await timed(`Synced assessments for ${ciid}`, () =>
            syncAssessments.sync(courseId, courseInstanceId, courseInstanceData, questionIds),
          );
        },
      );
    });
  });

  if (config.devMode) {
    logger.info('Flushing course element and extensions cache...');
    flushElementCache();
  }
  const courseDataHasErrors = courseDB.courseDataHasErrors(courseData);
  const courseDataHasErrorsOrWarnings = courseDB.courseDataHasErrorsOrWarnings(courseData);
  if (courseDataHasErrors) {
    logger.info(chalk.red('✖ Some JSON files contained errors and were unable to be synced'));
  } else if (courseDataHasErrorsOrWarnings) {
    logger.info(
      chalk.yellow('⚠ Some JSON files contained warnings but all were successfully synced'),
    );
  } else {
    logger.info(chalk.green('✓ Course sync successful'));
  }

  // Note that we deliberately log warnings/errors after syncing to the database
  // since in some cases we actually discover new warnings/errors during the
  // sync process. For instance, we don't actually validate exam UUIDs or qids of
  // questions imported from other courses until the database sync step.
  courseDB.writeErrorsAndWarningsForCourseData(courseId, courseData, (line) =>
    logger.info(line || ''),
  );

  return {
    status: 'complete',
    hadJsonErrors: courseDataHasErrors,
    hadJsonErrorsOrWarnings: courseDataHasErrorsOrWarnings,
    courseId,
    courseData,
  };
}

export async function syncDiskToSql(
  course_id: string,
  courseDir: string,
  logger: ServerJobLogger,
): Promise<SyncResults> {
  const lockName = getLockNameForCoursePath(courseDir);
  logger.verbose(chalkDim(`Trying lock ${lockName}`));
  const result = await namedLocks.doWithLock(
    lockName,
    {
      timeout: 0,
      onNotAcquired: () => {
        logger.verbose(chalk.red(`Did not acquire lock ${lockName}`));
        throw new Error(`Another user is already syncing or modifying the course: ${courseDir}`);
      },
    },
    async () => {
      logger.verbose(chalkDim(`Acquired lock ${lockName}`));
      return await syncDiskToSqlWithLock(course_id, courseDir, logger);
    },
  );

  logger.verbose(chalkDim(`Released lock ${lockName}`));
  return result;
}

export async function syncOrCreateDiskToSql(
  courseDir: string,
  logger: ServerJobLogger,
): Promise<SyncResults> {
  const course = await selectOrInsertCourseByPath(courseDir);
  return await syncDiskToSql(course.id, courseDir, logger);
}
