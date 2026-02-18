import { chunk, shuffle } from 'es-toolkit';
import * as streamifier from 'streamifier';

import * as namedLocks from '@prairielearn/named-locks';
import { loadSqlEquiv, queryRows, runInTransactionAsync } from '@prairielearn/postgres';

import { selectAssessmentInfoForJob } from '../models/assessment.js';

import type { AuthzData } from './authz-data-lib.js';
import { createCsvParser } from './csv.js';
import { type Assessment, type CourseInstance, UserSchema } from './db-types.js';
import { GroupOperationError, createGroup, createOrAddToGroup } from './groups.js';
import { createServerJob } from './server-jobs.js';

const sql = loadSqlEquiv(import.meta.url);

function groupUpdateLockName(assessment_id: string): string {
  return `assessment:${assessment_id}:groups`;
}

/**
 * Update groups from a CSV file.
 *
 * @param params
 * @param params.course_instance - The course instance in which the assessment exists.
 * @param params.assessment - The assessment to update.
 * @param params.csvFile - An object with keys {originalname, size, buffer}.
 * @param params.user_id - The current user performing the update.
 * @param params.authn_user_id - The current authenticated user.
 * @param params.authzData - The authorization data for the current user.
 * @returns The job sequence ID.
 */
export async function uploadInstanceGroups({
  course_instance,
  assessment,
  csvFile,
  user_id,
  authn_user_id,
  authzData,
}: {
  course_instance: CourseInstance;
  assessment: Assessment;
  csvFile: Express.Multer.File | null | undefined;
  user_id: string;
  authn_user_id: string;
  authzData: AuthzData;
}): Promise<string> {
  if (csvFile == null) {
    throw new Error('No CSV file uploaded');
  }

  const { assessment_label } = await selectAssessmentInfoForJob(assessment.id);

  const serverJob = await createServerJob({
    type: 'upload_groups',
    description: `Upload group settings for ${assessment_label}`,
    userId: user_id,
    authnUserId: authn_user_id,
    courseId: course_instance.course_id,
    courseInstanceId: course_instance.id,
    assessmentId: assessment.id,
  });

  serverJob.executeInBackground(async (job) => {
    const lockName = groupUpdateLockName(assessment.id);
    job.verbose(`Trying lock ${lockName}`);
    await namedLocks.doWithLock(
      lockName,
      {
        timeout: 10000,
        onNotAcquired: () => {
          job.fail('Another user is already updating the groups for this assessment.');
        },
      },
      async () => {
        job.verbose('Uploading group settings for ' + assessment_label);
        job.verbose(`Parsing uploaded CSV file "${csvFile.originalname}" (${csvFile.size} bytes)`);
        job.verbose('----------------------------------------');
        job.verbose('Processing group updates...');
        const csvStream = streamifier.createReadStream(csvFile.buffer, {
          encoding: 'utf8',
        });
        const csvParser = createCsvParser(csvStream);
        let successCount = 0,
          totalCount = 0;
        await runInTransactionAsync(async () => {
          for await (const { record } of csvParser) {
            const uid = record.uid;
            // `groupname` is supported for backwards compatibility. `group_name` is preferred.
            const group_name = record.group_name ?? record.groupname;

            if (!uid) {
              throw new Error('Missing required "uid" value in CSV row.');
            }
            if (!group_name) {
              throw new Error('Missing required "group_name" value in CSV row.');
            }

            totalCount++;
            await createOrAddToGroup({
              course_instance,
              assessment,
              group_name,
              uids: [uid],
              authn_user_id,
              authzData,
            }).then(
              () => successCount++,
              (err) => {
                if (err instanceof GroupOperationError) {
                  job.error(`Error adding ${uid} to group ${group_name}: ${err.message}`);
                } else {
                  throw err;
                }
              },
            );
          }
        });

        const errorCount = totalCount - successCount;
        job.verbose('----------------------------------------');
        if (errorCount === 0) {
          job.verbose(`Successfully updated groups for ${successCount} students, with no errors`);
        } else {
          job.verbose(`Successfully updated groups for ${successCount} students`);
          job.fail(`Error updating ${errorCount} students`);
        }
      },
    );
  });

  return serverJob.jobSequenceId;
}

/**
 * Randomly assign students to groups.
 *
 * @param params
 * @param params.course_instance - The course instance in which the assessment exists.
 * @param params.assessment - The assessment to update.
 * @param params.user_id - The current user performing the update.
 * @param params.authn_user_id - The current authenticated user.
 * @param params.max_group_size - max size of the group
 * @param params.min_group_size - min size of the group
 * @param params.authzData - The authorization data for the current user.
 * @returns The job sequence ID.
 */
export async function randomGroups({
  course_instance,
  assessment,
  user_id,
  authn_user_id,
  max_group_size,
  min_group_size,
  authzData,
}: {
  course_instance: CourseInstance;
  assessment: Assessment;
  user_id: string;
  authn_user_id: string;
  max_group_size: number;
  min_group_size: number;
  authzData: AuthzData;
}): Promise<string> {
  if (max_group_size < 2 || min_group_size < 1 || max_group_size < min_group_size) {
    throw new Error('Group Setting Requirements: max > 1; min > 0; max >= min');
  }

  const { assessment_label } = await selectAssessmentInfoForJob(assessment.id);

  const serverJob = await createServerJob({
    type: 'random_generate_groups',
    description: `Randomly generate groups for ${assessment_label}`,
    userId: user_id,
    authnUserId: authn_user_id,
    courseId: course_instance.course_id,
    courseInstanceId: course_instance.id,
    assessmentId: assessment.id,
  });

  serverJob.executeInBackground(async (job) => {
    const lockName = groupUpdateLockName(assessment.id);
    job.verbose(`Trying lock ${lockName}`);
    await namedLocks.doWithLock(
      lockName,
      {
        timeout: 10000,
        onNotAcquired: () => {
          job.fail('Another user is already updating the groups for this assessment.');
        },
      },
      async () => {
        job.verbose(`Acquired lock ${lockName}`);
        job.verbose('Randomly generate groups for ' + assessment_label);
        job.verbose('----------------------------------------');
        job.verbose('Fetching the enrollment lists...');
        const studentsWithoutGroup = await queryRows(
          sql.select_enrolled_students_without_group,
          { assessment_id: assessment.id },
          UserSchema,
        );
        const numStudents = studentsWithoutGroup.length;
        job.verbose(
          `There are ${numStudents} students enrolled in ${assessment_label} without a group`,
        );
        job.verbose('----------------------------------------');
        job.verbose(`Creating groups with a size between ${min_group_size} and ${max_group_size}`);

        let groupsCreated = 0,
          studentsGrouped = 0;
        await runInTransactionAsync(async () => {
          // Create random teams using the maximum size where possible
          const userGroups = chunk(
            shuffle(studentsWithoutGroup.map((user) => user.uid)),
            max_group_size,
          );
          // If the last group is too small, move students from larger groups to the last group
          const smallGroup = userGroups.at(-1);
          while (smallGroup && smallGroup.length < min_group_size) {
            // Take one student from each large group and add them to the small group
            const usersToMove = userGroups
              .filter((group) => group.length > min_group_size)
              .slice(smallGroup.length - min_group_size) // This will be negative (get the last n groups)
              .map((group) => group.pop()!);
            if (usersToMove.length === 0) {
              job.warn(
                `Could not create groups with the desired sizes. One group will have a size of ${smallGroup.length}`,
              );
              break;
            }
            smallGroup.push(...usersToMove);
          }

          for (const users of userGroups) {
            await createGroup({
              course_instance,
              assessment,
              group_name: null,
              uids: users,
              authn_user_id,
              authzData,
            }).then(
              () => {
                groupsCreated++;
                studentsGrouped += users.length;
              },
              (err) => {
                if (err instanceof GroupOperationError) {
                  job.error(err.message);
                } else {
                  throw err;
                }
              },
            );
          }
        });
        const errorCount = numStudents - studentsGrouped;
        job.verbose('----------------------------------------');
        if (studentsGrouped !== 0) {
          job.verbose(
            `Successfully grouped ${studentsGrouped} students into ${groupsCreated} groups`,
          );
        }
        if (errorCount !== 0) {
          job.fail(`Error adding ${errorCount} students to groups.`);
        }
      },
    );
  });

  return serverJob.jobSequenceId;
}
