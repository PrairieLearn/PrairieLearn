// @ts-check
const _ = require('lodash');
const streamifier = require('streamifier');
const csvtojson = require('csvtojson');
const namedLocks = require('@prairielearn/named-locks');
const { loadSqlEquiv, queryRow, queryRows, queryOptionalRow } = require('@prairielearn/postgres');
const { z } = require('zod');

const { IdSchema, UserSchema } = require('./db-types');
const { createServerJob } = require('./server-jobs');
import { GroupOperationError, createGroup, createOrAddToGroup } from './groups';

const sql = loadSqlEquiv(__filename);

const AssessmentInfoSchema = z.object({
  assessment_label: z.string(),
  course_instance_id: IdSchema,
  course_id: IdSchema,
});

/**
 * @param {string} assessment_id
 */
function groupUpdateLockName(assessment_id) {
  return `assessment:${assessment_id}:groups`;
}

/**
 * Update groups from a CSV file.
 *
 * @param {string} assessment_id - The assessment to update.
 * @param {object} csvFile - An object with keys {originalname, size, buffer}.
 * @param {string} user_id - The current user performing the update.
 * @param {string} authn_user_id - The current authenticated user.
 */
export async function uploadInstanceGroups(assessment_id, csvFile, user_id, authn_user_id) {
  if (csvFile == null) {
    throw new Error('No CSV file uploaded');
  }

  const assessmentInfo = await queryRow(
    sql.select_assessment_info,
    { assessment_id },
    AssessmentInfoSchema,
  );
  const assessmentLabel = assessmentInfo.assessment_label;
  const course_instance_id = assessmentInfo.course_instance_id;
  const course_id = assessmentInfo.course_id;

  const serverJob = await createServerJob({
    courseId: course_id,
    courseInstanceId: course_instance_id,
    assessmentId: assessment_id,
    userId: user_id,
    authnUserId: authn_user_id,
    type: 'upload_groups',
    description: `Upload group settings for ${assessmentLabel}`,
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
        job.verbose('Uploading group settings for ' + assessmentLabel);
        job.verbose(`Parsing uploaded CSV file "${csvFile.originalname}" (${csvFile.size} bytes)`);
        job.verbose(`----------------------------------------`);
        job.verbose(`Processing group updates...`);
        const csvStream = streamifier.createReadStream(csvFile.buffer, {
          encoding: 'utf8',
        });
        const csvConverter = csvtojson({ checkType: false, maxRowLength: 10000 });
        let totalRows = 0,
          successCount = 0;
        await csvConverter.fromStream(csvStream).subscribe(async (row) => {
          row = _.mapKeys(row, (_v, k) => k.toLowerCase());
          const groupName = row.groupname || null;
          const uid = row.uid || null;
          // Ignore rows without a group name and uid (blank lines)
          if (!uid && !groupName) return;

          totalRows++;
          await createOrAddToGroup(groupName, assessment_id, [uid], authn_user_id).then(
            () => successCount++,
            (err) => {
              if (err instanceof GroupOperationError) {
                job.error(`Error adding ${uid} to group ${groupName}: ${err.message}`);
              } else {
                throw err;
              }
            },
          );
        });

        const errorCount = totalRows - successCount;
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
 * @param {string} assessment_id - The assessment to update.
 * @param {string} user_id - The current user performing the update.
 * @param {string} authn_user_id - The current authenticated user.
 * @param {number} max_group_size - max size of the group
 * @param {number} min_group_size - min size of the group
 */
export async function autoGroups(
  assessment_id,
  user_id,
  authn_user_id,
  max_group_size,
  min_group_size,
) {
  if (max_group_size < 2 || min_group_size < 1 || max_group_size < min_group_size) {
    throw new Error('Group Setting Requirements: max > 1; min > 0; max >= min');
  }

  const assessmentInfo = await queryRow(
    sql.select_assessment_info,
    { assessment_id },
    AssessmentInfoSchema,
  );
  const assessmentLabel = assessmentInfo.assessment_label;
  const course_instance_id = assessmentInfo.course_instance_id;
  const course_id = assessmentInfo.course_id;

  const serverJob = await createServerJob({
    courseId: course_id,
    courseInstanceId: course_instance_id,
    assessmentId: assessment_id,
    userId: user_id,
    authnUserId: authn_user_id,
    type: 'auto_generate_groups',
    description: `Auto generate group settings for ${assessmentLabel}`,
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
        job.verbose('Auto generate group settings for ' + assessmentLabel);
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
          `There are ${numStudents} students enrolled in ${assessmentLabel} without a group`,
        );
        job.verbose(`----------------------------------------`);
        job.verbose(`Processing creating groups - max of ${max_group_size}`);

        // Find a group name of the format `groupNNN` that is not used
        const unusedGroupNameSuffix = await queryOptionalRow(
          sql.select_unused_group_name_suffix,
          { assessment_id },
          z.number(),
        );
        let groupsCreated = 0,
          studentsGrouped = 0;
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
