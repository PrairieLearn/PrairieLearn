import async from 'async';
import { z } from 'zod';

import * as namedLocks from '@prairielearn/named-locks';
import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import { chalk, chalkDim } from '../lib/chalk.js';
import { config } from '../lib/config.js';
import { IdSchema } from '../lib/db-types.js';
import { getLockNameForCoursePath, selectOrInsertCourseByPath } from '../models/course.js';
import { flushElementCache } from '../question-servers/freeform.js';

import * as courseDB from './course-db.js';
import * as syncAssessmentModules from './fromDisk/assessmentModules.js';
import * as syncAssessmentSets from './fromDisk/assessmentSets.js';
import * as syncAssessments from './fromDisk/assessments.js';
import * as syncCourseInfo from './fromDisk/courseInfo.js';
import * as syncCourseInstances from './fromDisk/courseInstances.js';
import * as syncQuestions from './fromDisk/questions.js';
import * as syncTags from './fromDisk/tags.js';
import * as syncTopics from './fromDisk/topics.js';
import { planPartialSync } from './partial.js';
import { getInvalidRenames } from './sharing.js';

const sql = loadSqlEquiv(import.meta.filename);

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

interface Logger {
  info: (msg: string) => void;
  verbose: (msg: string) => void;
}

export async function checkSharingConfigurationValid(
  courseId: string,
  courseData: courseDB.CourseData,
  logger: Logger,
): Promise<boolean> {
  if (config.checkSharingOnSync) {
    // TODO: also check if questions were un-shared in the JSON or if any
    // sharing sets were deleted
    const invalidRenames = await getInvalidRenames(courseId, courseData);
    if (invalidRenames.length > 0) {
      logger.info(
        chalk.red(
          `✖ Course sync completely failed. The following questions are shared and cannot be renamed or deleted: ${invalidRenames.join(', ')}`,
        ),
      );
      return false;
    }
  }
  return true;
}

/**
 * Returns a map from course instance short names to their corresponding database IDs.
 */
async function getCourseInstanceIdMap(courseId: string): Promise<Record<string, string>> {
  const courseInstanceIds = await queryRows(
    sql.select_course_instance_ids,
    { course_id: courseId },
    z.object({
      short_name: z.string(),
      id: IdSchema,
    }),
  );

  const courseInstanceIdMap: Record<string, string> = {};
  for (const { short_name, id } of courseInstanceIds) {
    courseInstanceIdMap[short_name] = id;
  }
  return courseInstanceIdMap;
}

/**
 * Returns a map from question QIDs to their corresponding database IDs.
 */
async function getQuestionIdMap(courseId: string): Promise<Record<string, string>> {
  const questionIds = await queryRows(
    sql.select_question_ids,
    { course_id: courseId },
    z.object({
      qid: z.string(),
      id: IdSchema,
    }),
  );

  const questionIdMap: Record<string, string> = {};
  for (const { qid, id } of questionIds) {
    questionIdMap[qid] = id;
  }
  return questionIdMap;
}

export async function syncDiskToSqlWithLock(
  courseId: string,
  courseDir: string,
  logger: Logger,
  options?: {
    courseData?: courseDB.CourseData;
    /**
     * If a list of changed files is provided, we can do a more efficient sync
     * that only syncs the parts of the course that have changed.
     */
    changedFiles?: string[] | null;
  },
): Promise<SyncResults> {
  async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
    const start = performance.now();

    const result = await fn();

    const duration = performance.now() - start;
    logger.verbose(`${label} in ${duration.toFixed(2)}ms`);

    return result;
  }

  logger.info('Loading info.json files from course repository');

  const courseData =
    options?.courseData ??
    (await timed('Loaded course data from disk', () =>
      courseDB.loadFullCourse(courseId, courseDir),
    ));

  // TODO: we need to track some notion of a sync version number that we can
  // increment whenever we make a change to the sync process that would
  // necessitate a full sync. Whenever the version number stored for a course
  // matches the current sync version number, we know we can do a partial sync.
  //
  // TODO: feature-flag partial sync so we can test it in production without
  // risk of breaking random courses. See how bad it would be to change the
  // function signature here to take a full Course object instead of just the
  // ID and path. That would make it easier to get an institution ID to check
  // feature flags against. Alternatively, just query for the institution ID here.
  const partialSyncPlan = options?.changedFiles
    ? planPartialSync(options?.changedFiles, new Set(Object.keys(courseData.courseInstances)))
    : null;

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
    if (!partialSyncPlan || partialSyncPlan.syncCourse) {
      await timed('Synced course info', () => syncCourseInfo.sync(courseData, courseId));
    } else {
      logger.info('Course info unchanged, skipping');
    }

    // We need the list of course instance IDs for assessment syncing, so we
    // can't trivially skip this step even if no course instances have changed.
    //
    // If we really want to skip this step, we can always add separate code to
    // fetch a list of all course instance IDs from the database. However, this
    // is generally fast enough that we can run it unconditionally.
    if (!partialSyncPlan || partialSyncPlan.syncCourseInstances) {
      await timed('Synced course instances', () => syncCourseInstances.sync(courseId, courseData));
    }

    // If either the course or the questions have changed, we need to sync topics,
    // as a question could specify a topic that isn't listed in the course JSON file.
    if (!partialSyncPlan || partialSyncPlan.syncCourse || partialSyncPlan.syncQuestions) {
      await timed('Synced topics', () => syncTopics.sync(courseId, courseData));
    } else {
      logger.info('Course info and questions unchanged, skipping topics syncing');
    }

    // Similarly, a change to assessments could change the set of sets/modules we need
    // to sync to the database since they might add a set that doesn't appear in the
    // course JSON file.
    if (
      !partialSyncPlan ||
      partialSyncPlan.syncCourse ||
      partialSyncPlan.syncCourseInstanceAssessments.size > 0
    ) {
      await timed('Synced assessment sets', () => syncAssessmentSets.sync(courseId, courseData));
      await timed('Synced assessment modules', () =>
        syncAssessmentModules.sync(courseId, courseData),
      );
    } else {
      logger.info(
        'Course info and assessments unchanged, skipping assessment sets/modules syncing',
      );
    }

    if (!partialSyncPlan || partialSyncPlan.syncQuestions) {
      await timed('Synced questions', () => syncQuestions.sync(courseId, courseData));
    }

    const questionIds = await getQuestionIdMap(courseId);

    if (!partialSyncPlan || partialSyncPlan.syncQuestions) {
      await timed('Synced tags', () => syncTags.sync(courseId, courseData, questionIds));
    }

    if (!partialSyncPlan || partialSyncPlan.syncCourseInstanceAssessments.size > 0) {
      const courseInstanceIds = await getCourseInstanceIdMap(courseId);

      await timed('Synced all assessments', async () => {
        // Ensure that a single course with a ton of course instances can't
        // monopolize the database connection pool.
        await async.eachLimit(
          Object.entries(courseData.courseInstances),
          3,
          async ([ciid, courseInstanceData]) => {
            const courseInstanceId = courseInstanceIds[ciid];
            if (!partialSyncPlan || partialSyncPlan.syncCourseInstanceAssessments.has(ciid)) {
              await timed(`Synced assessments for ${ciid}`, () =>
                syncAssessments.sync(courseId, courseInstanceId, courseInstanceData, questionIds),
              );
            } else {
              logger.info(`Assessments for ${ciid} unchanged, skipping`);
            }
          },
        );
      });
    } else {
      logger.info('All assessments unchanged skipping');
    }
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
  logger: Logger,
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
  logger: Logger,
): Promise<SyncResults> {
  const course = await selectOrInsertCourseByPath(courseDir);
  return await syncDiskToSql(course.id, courseDir, logger);
}
