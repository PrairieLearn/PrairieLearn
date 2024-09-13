import { error } from 'console';
import * as fs from 'fs'; // TEST
import * as path from 'path'; // TEST

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
import { makePerformance } from './performance.js';

const perf = makePerformance('sync');

// Performance data can be logged by setting the `PROFILE_SYNC` environment variable

export interface SyncResults {
  hadJsonErrors: boolean;
  hadJsonErrorsOrWarnings: boolean;
  courseId: string;
  courseData: courseDB.CourseData;
}

interface Logger {
  info: (msg: string) => void;
  verbose: (msg: string) => void;
}

export async function syncDiskToSqlWithLock(
  courseId: string,
  courseDir: string,
  logger: Logger,
): Promise<SyncResults> {
  logger.info('Loading info.json files from course repository');
  perf.start('sync');

  const courseData = await perf.timed('loadCourseData', () =>
    courseDB.loadFullCourse(courseId, courseDir),
  );

  /*
   * Check that all questions in publicly shared course instances are also shared publicly
   */
  for (const courseInstanceKey in courseData.courseInstances) {
    const courseInstance = courseData.courseInstances[courseInstanceKey];

    console.log(`Checking course instance ${courseInstanceKey}`); // TEST
    // courseInstance.sharedPublicly = true; // TEST
    if (courseInstance.sharedPublicly) {
      for (const assessmentKey in courseInstance.assessments) {
        const assessment = courseInstance.assessments[assessmentKey];
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

  logger.info('Syncing info to database');
  await perf.timed('syncCourseInfo', () => syncCourseInfo.sync(courseData, courseId));
  const courseInstanceIds = await perf.timed('syncCourseInstances', () =>
    syncCourseInstances.sync(courseId, courseData),
  );
  await perf.timed('syncTopics', () => syncTopics.sync(courseId, courseData));
  const questionIds = await perf.timed('syncQuestions', () =>
    syncQuestions.sync(courseId, courseData),
  );

  await perf.timed('syncTags', () => syncTags.sync(courseId, courseData, questionIds));
  await perf.timed('syncAssessmentSets', () => syncAssessmentSets.sync(courseId, courseData));
  await perf.timed('syncAssessmentModules', () => syncAssessmentModules.sync(courseId, courseData));
  perf.start('syncAssessments');
  await Promise.all(
    Object.entries(courseData.courseInstances).map(async ([ciid, courseInstanceData]) => {
      const courseInstanceId = courseInstanceIds[ciid];
      await perf.timed(`syncAssessments${ciid}`, () =>
        syncAssessments.sync(courseId, courseInstanceId, courseInstanceData, questionIds),
      );
    }),
  );
  perf.end('syncAssessments');
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

  perf.end('sync');
  return {
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
        throw new Error(
          `Question ${questionId} is not shared publicly in public course instance ${courseInstanceKey}. All questions in a public course instance must be shared publicly.`,
        );
      } else {
        console.log(
          `Question ${questionId} is shared publicly in public course instance ${courseInstanceKey}. CONGRATS! TEST!`,
        ); // TEST
      }*/
    } else {
      console.error(`Missing JSON file: ${infoJsonPath}`);
    }
  } catch (error) {
    console.error(`Error reading or parsing JSON file: ${infoJsonPath}`, error);
  }
}
