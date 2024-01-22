// @ts-check
const _ = require('lodash');
const streamifier = require('streamifier');
const csvtojson = require('csvtojson');
const namedLocks = require('@prairielearn/named-locks');
const { loadSqlEquiv, queryRow, queryRows } = require('@prairielearn/postgres');
const { z } = require('zod');

const { IdSchema, UserSchema } = require('./db-types');
const { createServerJob } = require('./server-jobs');
import { getEnrollmentForUserInCourseInstance } from '../models/enrollment';
import { selectUserByUid } from '../models/user';
import { createGroup, createOrAddToGroup } from './groups';

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
        const csvConverter = csvtojson({
          colParser: {
            groupname: 'string',
            groupName: 'string',
            uid: 'string',
            UID: 'string',
            Uid: 'string',
          },
          maxRowLength: 10000,
        });
        let totalRows = 0,
          successCount = 0;
        await csvConverter.fromStream(csvStream).subscribe(async (json) => {
          json = _.mapKeys(json, (_v, k) => k.toLowerCase());
          const groupName = json.groupname || null;
          const uid = json.uid || null;
          // Ignore rows without a group name and uid (blank lines)
          if (!uid && !groupName) return;

          totalRows++;
          const user = await selectUserByUid(uid);
          if (!user) {
            job.error(`User with uid ${uid} does not exist`);
            return;
          }
          const enrollment = await getEnrollmentForUserInCourseInstance({
            user_id: user.user_id,
            course_instance_id,
          });
          if (!enrollment) {
            job.error(`User ${user.uid} is not enrolled in this course instance`);
            return;
          }

          createOrAddToGroup(groupName, assessment_id, [user.user_id], authn_user_id).then(
            () => successCount++,
            (err) => job.error(err.message),
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
        const groupNumber = await queryRow(
          sql.select_unused_group_name,
          { assessment_id },
          z.number(),
        );
        let groupsCreated = 0;
        // Create groups using the groups of maximum size where possible
        for (let i = groupNumber; studentsToGroup.length > 0; i++) {
          const groupName = `group${i}`;
          const users = studentsToGroup.splice(0, max_group_size).map((user) => user.user_id);
          await createGroup(groupName, assessment_id, users, authn_user_id).then(
            () => groupsCreated++,
            (err) => job.error(err.message),
          );
        }
        const ungroupedStudentsAfterUpdate = await queryRows(
          sql.select_enrolled_students_without_group,
          { assessment_id },
          UserSchema,
        );
        const errorCount = ungroupedStudentsAfterUpdate.length;
        const successCount = numStudents - errorCount;
        job.verbose(`----------------------------------------`);
        if (successCount !== 0) {
          job.verbose(`Successfully grouped ${successCount} students into ${groupsCreated} groups`);
        }
        if (errorCount !== 0) {
          job.fail(
            `Error adding the following ${errorCount} students to groups: ${ungroupedStudentsAfterUpdate
              .map((user) => user.uid)
              .join(', ')}`,
          );
        }
      },
    );
  });

  return serverJob.jobSequenceId;
}
