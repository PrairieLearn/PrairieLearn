const ERR = require('async-stacktrace');
const _ = require('lodash');
const streamifier = require('streamifier');
const csvtojson = require('csvtojson');
const namedLocks = require('@prairielearn/named-locks');

const { logger } = require('@prairielearn/logger');
const serverJobs = require('./server-jobs-legacy');
const error = require('@prairielearn/error');
const sqldb = require('@prairielearn/postgres');

const sql = sqldb.loadSqlEquiv(__filename);

module.exports = {
  /**
   * Update groups from a CSV file.
   *
   * @param {number} assessment_id - The assessment to update.
   * @param {object} csvFile - An object with keys {originalname, size, buffer}.
   * @param {number} user_id - The current user performing the update.
   * @param {number} authn_user_id - The current authenticated user.
   * @param {function} callback - A callback(err, job_sequence_id) function.
   */
  uploadInstanceGroups(assessment_id, csvFile, user_id, authn_user_id, callback) {
    if (csvFile == null) {
      return callback(new Error('No CSV file uploaded'));
    }
    let params = { assessment_id };
    sqldb.queryOneRow(sql.select_assessment_info, params, function (err, result) {
      if (ERR(err, callback)) return;
      const assessmentLabel = result.rows[0].assessment_label;
      const course_instance_id = result.rows[0].course_instance_id;
      const course_id = result.rows[0].course_id;
      const options = {
        course_id: course_id,
        course_instance_id: course_instance_id,
        assessment_id: assessment_id,
        user_id: user_id,
        authn_user_id: authn_user_id,
        type: 'upload_groups',
        description: `Upload group settings for ${assessmentLabel}`,
      };
      //create a job page to display progress and error message
      serverJobs.createJobSequence(options, function (err, job_sequence_id) {
        if (ERR(err, callback)) return;
        callback(null, job_sequence_id);
        const jobOptions = {
          course_id: course_id,
          course_instance_id: course_instance_id,
          assessment_id: assessment_id,
          user_id: user_id,
          authn_user_id: authn_user_id,
          type: 'upload_groups',
          description: 'Upload group settings for ' + assessmentLabel,
          job_sequence_id: job_sequence_id,
          last_in_sequence: true,
        };
        serverJobs.createJob(jobOptions, function (err, job) {
          if (err) {
            logger.error('Error in createJob()', err);
            serverJobs.failJobSequence(job_sequence_id);
            return;
          }
          //create a lock to prevent two instructors from changing the same group assessement at the same time
          const lockName = 'grouping assessment_id ' + assessment_id;
          job.verbose(`Trying lock ${lockName}`);
          namedLocks.tryLock(lockName, (err, lock) => {
            if (err || lock == null) {
              job.verbose(`Did not acquire lock ${lockName}`);
              job.fail(
                `Another user is already modifying group setting for this assessment. Please try again later.`,
              );
              return;
            } else {
              job.verbose(`Acquired lock ${lockName}`);
              job.verbose('Uploading group settings for ' + assessmentLabel);
              job.verbose(
                `Parsing uploaded CSV file "${csvFile.originalname}" (${csvFile.size} bytes)`,
              );
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
              let updateList = [];
              csvConverter
                .fromStream(csvStream)
                .subscribe((json) => {
                  let groupName = json.groupName || json.groupname || null;
                  let uid = json.uid || json.UID || json.Uid || null;
                  updateList.push([groupName, uid]);
                })
                .then(() => {
                  let params = [assessment_id, updateList, authn_user_id];
                  sqldb.call('assessment_groups_update', params, (err, result) => {
                    const allCount = updateList.length;
                    let successCount = 0,
                      errorCount = 0;
                    if (err) {
                      job.verbose(String(err)); //server error
                      errorCount = allCount; //all failed
                    } else {
                      const notExist = result.rows[0].not_exist_user;
                      const inGroup = result.rows[0].already_in_group;
                      if (notExist) {
                        job.verbose(`----------------------------------------`);
                        job.verbose(
                          `ERROR: The following users do not exist. Please check their uids first.`,
                        );
                        notExist.forEach((user) => {
                          job.verbose(user);
                        });
                        errorCount += notExist.length;
                      }
                      if (inGroup) {
                        job.verbose(`----------------------------------------`);
                        job.verbose(`ERROR: The following users are already in a group.`);
                        inGroup.forEach((user) => {
                          job.verbose(user);
                        });
                        errorCount += inGroup.length;
                      }
                      successCount = allCount - errorCount;
                    }
                    job.verbose(`----------------------------------------`);
                    namedLocks.releaseLock(lock, (lockErr) => {
                      if (lockErr) {
                        job.fail(`ERROR: The lock ${lockName} was not released successfully`);
                        return;
                      }
                    });
                    job.verbose(`Released lock ${lockName}`);
                    if (errorCount === 0) {
                      job.verbose(
                        `Successfully updated groups for ${successCount} students, with no errors`,
                      );
                      job.succeed();
                    } else {
                      job.verbose(`Successfully updated groups for ${successCount} students`);
                      job.fail(`Error updating ${errorCount} students`);
                    }
                  });
                })
                .catch((err) => {
                  job.fail(error.newMessage(err, 'Error processing CSV'));
                });
            }
          });
        });
      });
    });
  },

  /**
   * Auto generate group settings from input
   *
   * @param {number} assessment_id - The assessment to update.
   * @param {number} user_id - The current user performing the update.
   * @param {number} authn_user_id - The current authenticated user.
   * @param {number} max_group_size - max size of the group
   * @param {number} min_group_size - min size of the group
   * @param {number} option - auto generating mode
   * @param {function} callback - A callback(err, job_sequence_id) function.
   */
  autoGroups(
    assessment_id,
    user_id,
    authn_user_id,
    max_group_size,
    min_group_size,
    option,
    callback,
  ) {
    if (max_group_size < 2 || min_group_size < 1 || max_group_size < min_group_size) {
      return callback(new Error('Group Setting Requirements: max > 1; min > 0; max >= min'));
    }
    let params = { assessment_id };
    sqldb.queryOneRow(sql.select_assessment_info, params, function (err, result) {
      if (ERR(err, callback)) return;
      const assessmentLabel = result.rows[0].assessment_label;
      const course_instance_id = result.rows[0].course_instance_id;
      const course_id = result.rows[0].course_id;

      const options = {
        course_id: course_id,
        course_instance_id: course_instance_id,
        assessment_id: assessment_id,
        user_id: user_id,
        authn_user_id: authn_user_id,
        type: 'auto_generate_groups',
        description: 'Auto generate group settings for ' + assessmentLabel,
      };
      serverJobs.createJobSequence(options, function (err, job_sequence_id) {
        if (ERR(err, callback)) return;
        callback(null, job_sequence_id);

        const jobOptions = {
          course_id: course_id,
          course_instance_id: course_instance_id,
          assessment_id: assessment_id,
          user_id: user_id,
          authn_user_id: authn_user_id,
          type: 'auto_generate_groups',
          description: 'Auto generate group settings for ' + assessmentLabel,
          job_sequence_id: job_sequence_id,
          last_in_sequence: true,
        };
        serverJobs.createJob(jobOptions, function (err, job) {
          if (err) {
            logger.error('Error in createJob()', err);
            serverJobs.failJobSequence(job_sequence_id);
            return;
          }
          const lockName = 'grouping assessment_id ' + assessment_id;
          job.verbose(`Trying lock ${lockName}`);
          namedLocks.tryLock(lockName, (err, lock) => {
            if (err || lock == null) {
              job.verbose(`Did not acquire lock ${lockName}`);
              job.fail(
                `Another user is already modifying group setting for this assessment. Please try again later.`,
              );
              return;
            }

            (async () => {
              job.verbose(`Acquired lock ${lockName}`);
              job.verbose('Auto generate group settings for ' + assessmentLabel);
              job.verbose(`----------------------------------------`);
              job.verbose(`Fetching the enrollment lists...`);
              const aid = { assessment_id };
              const students = [];
              const resultList = await sqldb.queryAsync(sql.select_enrollments, aid);
              resultList.rows.forEach((element) => {
                students.push(element.user_list);
              });
              _.shuffle(students);
              var numStudents = resultList.rowCount;
              var notAssigned = [];
              const resultList2 = await sqldb.queryAsync(sql.select_not_assigned, aid);
              resultList2.rows.forEach((element) => {
                notAssigned.push(element.user_list);
              });
              _.shuffle(notAssigned);
              var numNotAssigned = resultList2.rowCount;
              job.verbose(`There are ` + numStudents + ' students enrolled in ' + assessmentLabel);
              job.verbose(numNotAssigned + ' of them have not been in a group');
              job.verbose(`----------------------------------------`);
              job.verbose(
                `Processing creating groups - max of ` +
                  max_group_size +
                  ' and min of ' +
                  min_group_size,
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
              const params = [assessment_id, updateList, authn_user_id];
              const result = await sqldb.callAsync('assessment_groups_update', params);
              const allCount = updateList.length;
              let successCount = 0,
                errorCount = 0;
              if (err) {
                job.verbose(String(err)); //server error
                errorCount = allCount; //all failed
              } else {
                const notExist = result.rows[0].not_exist_user;
                const inGroup = result.rows[0].already_in_group;
                if (notExist) {
                  job.verbose(`----------------------------------------`);
                  job.verbose(
                    `ERROR: The following users do not exist. Please check their uids first.`,
                  );
                  notExist.forEach((user) => {
                    job.verbose(user);
                  });
                  errorCount += notExist.length;
                }
                if (inGroup) {
                  job.verbose(`----------------------------------------`);
                  job.verbose(`ERROR: The following users are already in a group.`);
                  inGroup.forEach((user) => {
                    job.verbose(user);
                  });
                  errorCount += inGroup.length;
                }
                successCount = allCount - errorCount;
              }
              job.verbose(`----------------------------------------`);
              if (errorCount === 0) {
                job.verbose(
                  `Successfully updated groups for ${successCount} students, with no errors`,
                );
                job.succeed();
              } else {
                job.verbose(`Successfully updated groups for ${successCount} students`);
                job.fail(`Error updating ${errorCount} students`);
              }
            })()
              .catch((err) => {
                logger.error('Error while creating groups', err);
                serverJobs.failJobSequence(job_sequence_id);
              })
              .finally(() => {
                namedLocks.releaseLock(lock, (lockErr) => {
                  if (lockErr) {
                    job.fail(`ERROR: The lock ${lockName} was not released successfully`);
                    return;
                  }
                  job.verbose(`Released lock ${lockName}`);
                });
              });
          });
        });
      });
    });
  },
};
