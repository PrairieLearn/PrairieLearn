import * as _ from 'lodash';
import * as streamifier from 'streamifier';
import csvtojson = require('csvtojson');
import * as namedLocks from '@prairielearn/named-locks';
import {
  loadSqlEquiv,
  queryRow,
  queryRows,
  queryOptionalRow,
  runInTransactionAsync,
} from '@prairielearn/postgres';
import { z } from 'zod';

import { IdSchema, UserSchema } from './db-types';
import { createServerJob } from './server-jobs';
import { GroupOperationError, createGroup, createOrAddToGroup } from './groups';

const sql = loadSqlEquiv(__filename);

const AssessmentInfoSchema = z.object({
  assessment_label: z.string(),
  course_instance_id: IdSchema,
  course_id: IdSchema,
});

function groupUpdateLockName(assessment_id: string): string {
  return `assessment:${assessment_id}:groups`;
}

/**
 * Update groups from a CSV file.
 *
 * @param assessment_id - The assessment to update.
 * @param csvFile - An object with keys {originalname, size, buffer}.
 * @param user_id - The current user performing the update.
 * @param authn_user_id - The current authenticated user.
 * @returns The job sequence ID.
 */
export async function uploadInstanceGroups(
  assessment_id: string,
  csvFile: Express.Multer.File | null | undefined,
  user_id: string,
  authn_user_id: string,
): Promise<string> {
  if (csvFile == null) {
    throw new Error('No CSV file uploaded');
  }

  const { assessment_label, course_id, course_instance_id } = await queryRow(
    sql.select_assessment_info,
    { assessment_id },
    AssessmentInfoSchema,
  );

  const serverJob = await createServerJob({
    courseId: course_id,
    courseInstanceId: course_instance_id,
    assessmentId: assessment_id,
    userId: user_id,
    authnUserId: authn_user_id,
    type: 'upload_groups',
    description: `Upload group settings for ${assessment_label}`,
  });

  serverJob.executeInBackground(async (job) => {
    const lockName = groupUpdateLockName(assessment_id);
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
        job.verbose(`----------------------------------------`);
        job.verbose(`Processing group updates...`);
        const csvStream = streamifier.createReadStream(csvFile.buffer, {
          encoding: 'utf8',
        });
        const csvConverter = csvtojson({ checkType: false, maxRowLength: 10000 });
        let successCount = 0;
        const groupAssignments = (await csvConverter.fromStream(csvStream))
          .map((row) => _.mapKeys(row, (_v, k) => k.toLowerCase()))
          .filter((row) => row.uid && row.groupname);
        await runInTransactionAsync(async () => {
          for (const { uid, groupname } of groupAssignments) {
            await createOrAddToGroup(groupname, assessment_id, [uid], authn_user_id).then(
              () => successCount++,
              (err) => {
                if (err instanceof GroupOperationError) {
                  job.error(`Error adding ${uid} to group ${groupname}: ${err.message}`);
                } else {
                  throw err;
                }
              },
            );
          }
        });

        const errorCount = groupAssignments.length - successCount;
        job.verbose(`----------------------------------------`);
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
 * Auto generate group settings from input
 *
 * @param assessment_id - The assessment to update.
 * @param user_id - The current user performing the update.
 * @param authn_user_id - The current authenticated user.
 * @param max_group_size - max size of the group
 * @param min_group_size - min size of the group
 * @returns The job sequence ID.
 */
export async function autoGroups(
  assessment_id: string,
  user_id: string,
  authn_user_id: string,
  max_group_size: number,
  min_group_size: number,
): Promise<string> {
  if (max_group_size < 2 || min_group_size < 1 || max_group_size < min_group_size) {
    throw new Error('Group Setting Requirements: max > 1; min > 0; max >= min');
  }

  const { assessment_label, course_id, course_instance_id } = await queryRow(
    sql.select_assessment_info,
    { assessment_id },
    AssessmentInfoSchema,
  );

  const serverJob = await createServerJob({
    courseId: course_id,
    courseInstanceId: course_instance_id,
    assessmentId: assessment_id,
    userId: user_id,
    authnUserId: authn_user_id,
    type: 'auto_generate_groups',
    description: `Auto generate group settings for ${assessment_label}`,
  });

  serverJob.executeInBackground(async (job) => {
    const lockName = groupUpdateLockName(assessment_id);
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
        job.verbose('Auto generate group settings for ' + assessment_label);
        job.verbose(`----------------------------------------`);
        job.verbose(`Fetching the enrollment lists...`);
        const studentsToGroup = await queryRows(
          sql.select_enrolled_students_without_group,
          { assessment_id },
          UserSchema,
        );
        _.shuffle(studentsToGroup);
        const numStudents = studentsToGroup.length;
        job.verbose(
          `There are ${numStudents} students enrolled in ${assessment_label} without a group`,
        );
        job.verbose(`----------------------------------------`);
        job.verbose(`Creating groups with a max size of ${max_group_size}`);

        let groupsCreated = 0,
          studentsGrouped = 0;
        await runInTransactionAsync(async () => {
          // Find a group name of the format `groupNNN` that is not used
          const unusedGroupNameSuffix = await queryOptionalRow(
            sql.select_unused_group_name_suffix,
            { assessment_id },
            z.number(),
          );
          // Create groups using the groups of maximum size where possible
          for (let i = unusedGroupNameSuffix ?? 1; studentsToGroup.length > 0; i++) {
            const groupName = `group${i}`;
            const users = studentsToGroup.splice(0, max_group_size).map((user) => user.uid);
            await createGroup(groupName, assessment_id, users, authn_user_id).then(
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
        job.verbose(`----------------------------------------`);
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
