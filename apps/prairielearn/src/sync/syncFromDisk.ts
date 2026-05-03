import assert from 'node:assert';

import async from 'async';

import * as namedLocks from '@prairielearn/named-locks';
import { runInTransactionAsync } from '@prairielearn/postgres';

import { chalk } from '../lib/chalk.js';
import { config } from '../lib/config.js';
import type { Course } from '../lib/db-types.js';
import { features } from '../lib/features/index.js';
import { type ServerJobLogger } from '../lib/server-jobs.js';
import { selectCourseInstanceById } from '../models/course-instances.js';
import {
  getGitDefaultBranch,
  getGitRemoteUrl,
  getLockNameForCoursePath,
  selectOrInsertCourseByPath,
} from '../models/course.js';
import { flushElementCache } from '../question-servers/freeform.js';

import * as courseDB from './course-db.js';
import { type AccessControlSyncInput, syncAllAccessControl } from './fromDisk/accessControl.js';
import * as syncAssessmentModules from './fromDisk/assessmentModules.js';
import * as syncAssessmentSets from './fromDisk/assessmentSets.js';
import * as syncAssessments from './fromDisk/assessments.js';
import * as syncAuthors from './fromDisk/authors.js';
import * as syncCourseInfo from './fromDisk/courseInfo.js';
import * as syncCourseInstances from './fromDisk/courseInstances.js';
import * as syncQuestions from './fromDisk/questions.js';
import * as syncSharingSets from './fromDisk/sharing.js';
import { syncStudentLabels } from './fromDisk/studentLabels.js';
import * as syncTags from './fromDisk/tags.js';
import * as syncTopics from './fromDisk/topics.js';
import * as infofile from './infofile.js';
import {
  checkInvalidPublicSharingRemovals,
  checkInvalidSharingSetDeletions,
  checkInvalidSharingSetRemovals,
  getInvalidRenames,
  selectSharedQuestions,
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
  course: Course,
  courseData: courseDB.CourseData,
  logger: ServerJobLogger,
): Promise<boolean> {
  if (!config.checkSharingOnSync) return true;

  const sharingEnabled = await features.enabled('question-sharing', {
    course_id: course.id,
    institution_id: course.institution_id,
  });

  // If sharing is not enabled, we'll skip all of these sharing checks. Instead, we'll
  // already have validated that sharing attributes are not used, and we'll have emitted
  // sync errors if they are.
  if (!sharingEnabled) return true;

  const sharedQuestions = await selectSharedQuestions(course.id);
  const existInvalidRenames = getInvalidRenames(sharedQuestions, courseData, logger);
  const existInvalidPublicSharingRemovals = checkInvalidPublicSharingRemovals(
    sharedQuestions,
    courseData,
    logger,
  );
  const existInvalidSharingSetDeletions = await checkInvalidSharingSetDeletions(
    course.id,
    courseData,
    logger,
  );
  const existInvalidSharingSetRemovals = await checkInvalidSharingSetRemovals(
    course.id,
    courseData,
    logger,
  );

  return (
    !existInvalidRenames &&
    !existInvalidPublicSharingRemovals &&
    !existInvalidSharingSetDeletions &&
    !existInvalidSharingSetRemovals
  );
}

export async function syncDiskToSqlWithLock(
  course: Course,
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
      courseDB.loadFullCourse(course.id, course.path),
    );
  }

  const sharingConfigurationValid = await timed('Validated sharing configuration', () =>
    checkSharingConfigurationValid(course, courseData, logger),
  );
  if (!sharingConfigurationValid) {
    return {
      status: 'sharing_error',
      courseId: course.id,
    };
  }

  logger.info('Syncing info to database');

  await timed('Synced all course data', async () => {
    await timed('Synced course info', () =>
      syncCourseInfo.sync(course.path, courseData, course.id),
    );
    const courseInstanceIds = await timed('Synced course instances', () =>
      syncCourseInstances.sync(course.id, courseData),
    );
    await timed('Synced student labels', async () => {
      await async.eachLimit(
        Object.entries(courseData.courseInstances),
        3,
        async ([ciid, courseInstanceData]) => {
          // Every course instance id should be in this lookup.
          const courseInstanceId = courseInstanceIds[ciid];
          if (infofile.hasErrors(courseInstanceData.courseInstance)) return;
          const courseInstance = await selectCourseInstanceById(courseInstanceId);
          const studentLabels = courseInstanceData.courseInstance.data?.studentLabels;
          await syncStudentLabels(courseInstance, studentLabels);
        },
      );
    });
    await timed('Synced topics', () => syncTopics.sync(course.id, courseData));
    const questionIds = await timed('Synced questions', () =>
      syncQuestions.sync(course.id, courseData),
    );

    await timed('Synced authors', () => syncAuthors.sync(courseData.questions, questionIds));
    // We need to perform sharing validation at exactly this moment. We can only
    // do this once we have a dictionary of question IDs, as this process will also
    // populate any shared questions in that dictionary. We also need to do it before
    // syncing the assessment sets, as the presence of errors that this validation
    // could produce influences whether the "Unknown" assessment set is created.
    await timed('Check sharing validity', async () => {
      await async.eachLimit(Object.entries(courseData.courseInstances), 3, async ([, ci]) => {
        const prefs = await syncAssessments.validateAssessmentSharedQuestions(
          course.id,
          ci.assessments,
          questionIds,
        );
        // Pre-validate question preferences so that errors are present when
        // assessment sets are synced (which influences whether "Unknown" is created).
        syncAssessments.preValidateAssessmentPreferences(
          ci.assessments,
          courseData.questions,
          prefs,
        );
      });
    });

    await timed('Synced sharing sets', () =>
      syncSharingSets.sync(course.id, courseData, questionIds),
    );
    await timed('Synced tags', () => syncTags.sync(course.id, courseData, questionIds));
    await timed('Synced assessment sets', () => syncAssessmentSets.sync(course.id, courseData));
    await timed('Synced assessment modules', () =>
      syncAssessmentModules.sync(course.id, courseData),
    );
    const enhancedAccessControlEnabled = await features.enabled('enhanced-access-control', {
      institution_id: course.institution_id,
      course_id: course.id,
    });
    await timed('Synced all assessments', async () => {
      // Ensure that a single course with a ton of course instances can't
      // monopolize the database connection pool.
      await async.eachLimit(
        Object.entries(courseData.courseInstances),
        3,
        async ([ciid, courseInstanceData]) => {
          const courseInstanceId = courseInstanceIds[ciid];
          const assessmentIds = await timed(`Synced assessments for ${ciid}`, () =>
            syncAssessments.sync(
              course.id,
              courseInstanceId,
              courseInstanceData,
              questionIds,
              enhancedAccessControlEnabled,
            ),
          );

          if (assessmentIds.name_to_id_map && enhancedAccessControlEnabled) {
            const idMap = assessmentIds.name_to_id_map;
            await timed(`Synced access control for ${ciid}`, async () => {
              const inputs: AccessControlSyncInput[] = [];
              for (const [tid, assessment] of Object.entries(courseInstanceData.assessments)) {
                const assessmentId = idMap[tid];
                if (!assessmentId) continue;

                const accessControlRules = assessment.data?.accessControl;
                if (infofile.hasErrors(assessment)) {
                  continue;
                }
                if (!accessControlRules) {
                  inputs.push({ assessmentId, rules: [] });
                } else {
                  inputs.push({ assessmentId, rules: accessControlRules });
                }
              }

              await runInTransactionAsync(async () => {
                const validationErrors = await syncAllAccessControl(courseInstanceId, inputs);
                for (const [tid, assessment] of Object.entries(courseInstanceData.assessments)) {
                  const assessmentId = idMap[tid];
                  if (!assessmentId) continue;
                  const error = validationErrors.get(assessmentId);
                  if (error) {
                    infofile.addError(assessment, error);
                  }
                }
              });
            });
          }
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
    logger.error('✖ Some JSON files contained errors and were unable to be synced');
  } else if (courseDataHasErrorsOrWarnings) {
    logger.info('⚠ Some JSON files contained warnings but all were successfully synced');
  } else {
    logger.info(chalk.green('✓ Course sync successful'));
  }

  // Note that we deliberately log warnings/errors after syncing to the database
  // since in some cases we actually discover new warnings/errors during the
  // sync process. For instance, we don't actually validate exam UUIDs or qids of
  // questions imported from other courses until the database sync step.
  courseDB.writeErrorsAndWarningsForCourseData(course.id, courseData, (line) =>
    logger.info(line || ''),
  );

  return {
    status: 'complete',
    hadJsonErrors: courseDataHasErrors,
    hadJsonErrorsOrWarnings: courseDataHasErrorsOrWarnings,
    courseId: course.id,
    courseData,
  };
}

export async function syncDiskToSql(course: Course, logger: ServerJobLogger): Promise<SyncResults> {
  const lockName = getLockNameForCoursePath(course.path);
  logger.verbose(`Trying lock ${lockName}`);
  const result = await namedLocks.doWithLock(
    lockName,
    {
      timeout: 0,
      onNotAcquired: () => {
        logger.verbose(chalk.redBright(`Did not acquire lock ${lockName}`));
        throw new Error(`Another user is already syncing or modifying the course: ${course.path}`);
      },
    },
    async () => {
      logger.verbose(`Acquired lock ${lockName}`);
      return await syncDiskToSqlWithLock(course, logger);
    },
  );

  logger.verbose(`Released lock ${lockName}`);
  return result;
}

export async function syncOrCreateDiskToSql(
  courseDir: string,
  logger: ServerJobLogger,
): Promise<SyncResults> {
  // This should only ever be used in dev mode or tests.
  assert(config.devMode || process.env.NODE_ENV === 'test');

  // This intentionally only updates the branch/repository when a course is
  // created, not when it already exists. There's no particularly good reason
  // for this, so it could be changed in the future if desired.
  const course = await selectOrInsertCourseByPath(courseDir, {
    branch: await getGitDefaultBranch(courseDir),
    repository: await getGitRemoteUrl(courseDir),
  });
  return await syncDiskToSql(course, logger);
}
