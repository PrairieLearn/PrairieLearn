import _ from 'lodash';
import * as streamifier from 'streamifier';

import * as namedLocks from '@prairielearn/named-locks';
import { loadSqlEquiv, queryRows, runInTransactionAsync } from '@prairielearn/postgres';

import { selectAssessmentInfoForJob } from '../models/assessment.js';

import type { AuthzData } from './authz-data-lib.js';
import { createCsvParser } from './csv.js';
import { type Assessment, type CourseInstance, UserSchema } from './db-types.js';
import { createServerJob } from './server-jobs.js';
import { TeamOperationError, createOrAddToTeam, createTeam } from './teams.js';

const sql = loadSqlEquiv(import.meta.url);

function teamUpdateLockName(assessment_id: string): string {
  return `assessment:${assessment_id}:teams`;
}

/**
 * Update teams from a CSV file.
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
export async function uploadInstanceTeams({
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
    const lockName = teamUpdateLockName(assessment.id);
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
            const { uid, groupname } = record;
            if (!uid || !groupname) continue;
            totalCount++;
            await createOrAddToTeam({
              course_instance,
              assessment,
              team_name: groupname,
              uids: [uid],
              authn_user_id,
              authzData,
            }).then(
              () => successCount++,
              (err) => {
                if (err instanceof TeamOperationError) {
                  job.error(`Error adding ${uid} to group ${groupname}: ${err.message}`);
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
 * Randomly assign students to teams.
 *
 * @param params
 * @param params.course_instance - The course instance in which the assessment exists.
 * @param params.assessment - The assessment to update.
 * @param params.user_id - The current user performing the update.
 * @param params.authn_user_id - The current authenticated user.
 * @param params.max_team_size - max size of the team
 * @param params.min_team_size - min size of the team
 * @param params.authzData - The authorization data for the current user.
 * @returns The job sequence ID.
 */
export async function randomTeams({
  course_instance,
  assessment,
  user_id,
  authn_user_id,
  max_team_size,
  min_team_size,
  authzData,
}: {
  course_instance: CourseInstance;
  assessment: Assessment;
  user_id: string;
  authn_user_id: string;
  max_team_size: number;
  min_team_size: number;
  authzData: AuthzData;
}): Promise<string> {
  if (max_team_size < 2 || min_team_size < 1 || max_team_size < min_team_size) {
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
    const lockName = teamUpdateLockName(assessment.id);
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
        const studentsToGroup = await queryRows(
          sql.select_enrolled_students_without_team,
          { assessment_id: assessment.id },
          UserSchema,
        );
        _.shuffle(studentsToGroup);
        const numStudents = studentsToGroup.length;
        job.verbose(
          `There are ${numStudents} students enrolled in ${assessment_label} without a group`,
        );
        job.verbose('----------------------------------------');
        job.verbose(`Creating groups with a size between ${min_team_size} and ${max_team_size}`);

        let groupsCreated = 0,
          studentsGrouped = 0;
        await runInTransactionAsync(async () => {
          // Create groups using the groups of maximum size where possible
          const userGroups = _.chunk(
            studentsToGroup.map((user) => user.uid),
            max_team_size,
          );
          // If the last group is too small, move students from larger groups to the last group
          const smallGroup = userGroups.at(-1);
          while (smallGroup && smallGroup.length < min_team_size) {
            // Take one student from each large group and add them to the small group
            const usersToMove = userGroups
              .filter((group) => group.length > min_team_size)
              .slice(smallGroup.length - min_team_size) // This will be negative (get the last n groups)
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
            await createTeam({
              course_instance,
              assessment,
              team_name: null,
              uids: users,
              authn_user_id,
              authzData,
            }).then(
              () => {
                groupsCreated++;
                studentsGrouped += users.length;
              },
              (err) => {
                if (err instanceof TeamOperationError) {
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
