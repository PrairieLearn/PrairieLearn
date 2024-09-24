import * as fs from 'fs';
import * as path from 'path';

import async from 'async';

import * as namedLocks from '@prairielearn/named-locks';

import { chalk, chalkDim } from '../lib/chalk.js';
import { config } from '../lib/config.js';
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
import { getInvalidRenames } from './sharing.js';

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

export async function syncDiskToSqlWithLock(
  courseId: string,
  courseDir: string,
  logger: Logger,
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

  /*
   * Check that all questions in publicly shared course instances are also shared publicly
   */
  for (const courseInstanceKey in courseData.courseInstances) {
    const courseInstance = courseData.courseInstances[courseInstanceKey];

    console.log(`Checking course instance ${courseInstanceKey}`); // TEST
    courseInstance.sharedPublicly = true; // TEST
    courseData.courseInstances[courseInstanceKey].courseInstance.data.sharedPublicly =
      courseInstance.sharedPublicly; // TEST, probably unncecessary once the course instances have sharedPublicly defined correctly. Make sure it's defined correctly
    if (courseInstance.sharedPublicly) {
      console.log(`Course instance ${courseInstanceKey} is shared publicly`); // TEST
      for (const assessmentKey in courseInstance.assessments) {
        const assessment = courseInstance.assessments[assessmentKey];
        console.log(`Checking assessment ${assessmentKey}`); // TEST
        if (assessment.data && assessment.data.zones) {
          for (const zone of assessment.data.zones) {
            if (zone.questions) {
              for (const question of zone.questions) {
                if (question.id) {
                  const infoJsonPath = path.join(
                    courseDir,
                    'questions',
                    question.id || '',
                    'info.json',
                  );

                  await readQuestionInfoJson(infoJsonPath, question.id, courseInstanceKey);
                }
              }
            }
          }
        }
      }
    }
  }
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

async function readQuestionInfoJson(
  infoJsonPath: string,
  questionId: string,
  courseInstanceKey: string,
) {
  try {
    // Check if the file exists
    if (fs.existsSync(infoJsonPath)) {
      // Read and parse the info.json file
      const fileContent = fs.readFileSync(infoJsonPath, 'utf8');
      const questionInfo = JSON.parse(fileContent);

      // TEST, uncomment later. Unable to test other stuff since I can't make questions public yet (at least easily)
      /*if (!questionInfo.sharedPublicly || questionInfo.sharedPublicly === undefined) {
        throw new Error(`Question ${questionId} is not shared publicly in public course instance ${courseInstanceKey}. All questions in a public course instance must be shared publicly.`);
      } else {
        console.log(`Question ${questionId} is shared publicly in public course instance ${courseInstanceKey}. CONGRATS! TEST!`); // TEST
       }*/
    } else {
      console.error(`Missing JSON file: ${infoJsonPath}`);
    }
  } catch (error) {
    console.error(`Error reading or parsing JSON file: ${infoJsonPath}`, error);
  }
}
