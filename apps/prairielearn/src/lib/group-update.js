// @ts-check
const _ = require('lodash');
const streamifier = require('streamifier');
const csvtojson = require('csvtojson');
const namedLocks = require('@prairielearn/named-locks');
const sqldb = require('@prairielearn/postgres');

const { createServerJob } = require('./server-jobs');

const sql = sqldb.loadSqlEquiv(__filename);

module.exports = {
  /**
   * Update groups from a CSV file.
   *
   * @param {string} assessment_id - The assessment to update.
   * @param {object} csvFile - An object with keys {originalname, size, buffer}.
   * @param {string} user_id - The current user performing the update.
   * @param {string} authn_user_id - The current authenticated user.
   */
  async uploadInstanceGroups(assessment_id, csvFile, user_id, authn_user_id) {
    if (csvFile == null) {
      throw new Error('No CSV file uploaded');
    }

    const result = await sqldb.queryOneRowAsync(sql.select_assessment_info, { assessment_id });
    const assessmentLabel = result.rows[0].assessment_label;
    const course_instance_id = result.rows[0].course_instance_id;
    const course_id = result.rows[0].course_id;

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
      // Obtain a lock to prevent two instructors from changing the same group
      // assessment at the same time.
      const lockName = 'grouping assessment_id ' + assessment_id;
      job.verbose(`Acquiring lock ${lockName}`);
      await namedLocks.doWithLock(lockName, { timeout: 10000 }, async () => {
        job.verbose(`Acquired lock ${lockName}`);
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
        const updateList = [];
        await csvConverter.fromStream(csvStream).subscribe((json) => {
          let groupName = json.groupName || json.groupname || null;
          let uid = json.uid || json.UID || json.Uid || null;
          updateList.push([groupName, uid]);
        });
        const result = await sqldb.callAsync('assessment_groups_update', [
          assessment_id,
          updateList,
          authn_user_id,
        ]);
        let errorCount = 0;

        const notExist = result.rows[0].not_exist_user;
        if (notExist) {
          job.verbose(`----------------------------------------`);
          job.verbose(`ERROR: The following users do not exist. Please check their uids first.`);
          notExist.forEach((user) => {
            job.verbose(user);
          });
          errorCount += notExist.length;
        }

        const inGroup = result.rows[0].already_in_group;
        if (inGroup) {
          job.verbose(`----------------------------------------`);
          job.verbose(`ERROR: The following users are already in a group.`);
          inGroup.forEach((user) => {
            job.verbose(user);
          });
          errorCount += inGroup.length;
        }

        const successCount = updateList.length - errorCount;
        job.verbose(`----------------------------------------`);
        if (errorCount === 0) {
          job.verbose(`Successfully updated groups for ${successCount} students, with no errors`);
        } else {
          job.verbose(`Successfully updated groups for ${successCount} students`);
          job.fail(`Error updating ${errorCount} students`);
        }
      });
    });

    return serverJob.jobSequenceId;
  },

  /**
   * Auto generate group settings from input
   *
   * @param {string} assessment_id - The assessment to update.
   * @param {string} user_id - The current user performing the update.
   * @param {string} authn_user_id - The current authenticated user.
   * @param {number} max_group_size - max size of the group
   * @param {number} min_group_size - min size of the group
   */
  async autoGroups(assessment_id, user_id, authn_user_id, max_group_size, min_group_size) {
    if (max_group_size < 2 || min_group_size < 1 || max_group_size < min_group_size) {
      throw new Error('Group Setting Requirements: max > 1; min > 0; max >= min');
    }

    const result = await sqldb.queryOneRowAsync(sql.select_assessment_info, { assessment_id });
    const assessmentLabel = result.rows[0].assessment_label;
    const course_instance_id = result.rows[0].course_instance_id;
    const course_id = result.rows[0].course_id;

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
      const lockName = 'grouping assessment_id ' + assessment_id;
      job.verbose(`Trying lock ${lockName}`);
      await namedLocks.doWithLock(lockName, { timeout: 10000 }, async () => {
        job.verbose(`Acquired lock ${lockName}`);
        job.verbose('Auto generate group settings for ' + assessmentLabel);
        job.verbose(`----------------------------------------`);
        job.verbose(`Fetching the enrollment lists...`);
        const resultList = await sqldb.queryAsync(sql.select_enrollments, { assessment_id });
        const students = resultList.rows.map((row) => row.user_list);
        _.shuffle(students);
        const numStudents = resultList.rowCount;
        const notAssigned = [];
        const resultList2 = await sqldb.queryAsync(sql.select_not_assigned, { assessment_id });
        resultList2.rows.forEach((element) => {
          notAssigned.push(element.user_list);
        });
        _.shuffle(notAssigned);
        const numNotAssigned = resultList2.rowCount;
        job.verbose(`There are ` + numStudents + ' students enrolled in ' + assessmentLabel);
        job.verbose(numNotAssigned + ' of them have not been in a group');
        job.verbose(`----------------------------------------`);
        job.verbose(
          `Processing creating groups - max of ` + max_group_size + ' and min of ' + min_group_size
        );
        let numGroup = Math.ceil(numStudents / max_group_size);
        let updateList = [];
        // fill in the updateList with groupname and uid
        for (let i = 0; i < numGroup; i++) {
          let groupName = 'group' + i;
          for (let j = 0; j < max_group_size; j++) {
            if (students.length > 0) {
              let uid = students.pop();
              updateList.push([groupName, uid]);
            }
          }
        }
        const result = await sqldb.callAsync('assessment_groups_update', [
          assessment_id,
          updateList,
          authn_user_id,
        ]);
        let errorCount = 0;

        const notExist = result.rows[0].not_exist_user;
        if (notExist) {
          job.verbose(`----------------------------------------`);
          job.verbose(`ERROR: The following users do not exist. Please check their uids first.`);
          notExist.forEach((user) => job.verbose(user));
          errorCount += notExist.length;
        }

        const inGroup = result.rows[0].already_in_group;
        if (inGroup) {
          job.verbose(`----------------------------------------`);
          job.verbose(`ERROR: The following users are already in a group.`);
          inGroup.forEach((user) => job.verbose(user));
          errorCount += inGroup.length;
        }

        const successCount = updateList.length - errorCount;
        job.verbose(`----------------------------------------`);
        if (errorCount === 0) {
          job.verbose(`Successfully updated groups for ${successCount} students, with no errors`);
        } else {
          job.verbose(`Successfully updated groups for ${successCount} students`);
          job.fail(`Error updating ${errorCount} students`);
        }
      });
    });

    return serverJob.jobSequenceId;
  },
};
