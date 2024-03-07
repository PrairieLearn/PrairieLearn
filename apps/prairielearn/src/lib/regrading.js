// @ts-check
const ERR = require('async-stacktrace');
import * as async from 'async';
import * as path from 'path';
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));

import { logger } from '@prairielearn/logger';
import { createJob, createJobSequence, failJobSequence } from './server-jobs-legacy';
import { createServerJob } from './server-jobs';
import * as sqldb from '@prairielearn/postgres';
import * as ltiOutcomes from './ltiOutcomes';
import { z } from 'zod';
import { IdSchema } from './db-types';

const sql = sqldb.loadSqlEquiv(__filename);

export async function regradeAssessmentInstance(assessment_instance_id, user_id, authn_user_id) {
  const assessmentInstance = await sqldb.queryRow(
    sql.select_regrade_assessment_instance_info,
    { assessment_instance_id },
    z.object({
      assessment_instance_label: z.string(),
      user_uid: z.string().nullable(),
      group_name: z.string().nullable(),
      assessment_id: IdSchema,
      course_instance_id: IdSchema,
      course_id: IdSchema,
    }),
  );
  const assessment_instance_label = assessmentInstance.assessment_instance_label;
  let jobInfo;
  if (assessmentInstance.user_uid) {
    jobInfo = assessmentInstance.user_uid;
  } else {
    jobInfo = 'group name ' + assessmentInstance.group_name;
  }
  const serverJob = await createServerJob({
    courseId: assessmentInstance.course_id,
    courseInstanceId: assessmentInstance.course_instance_id,
    assessmentId: assessmentInstance.assessment_id,
    userId: user_id,
    authnUserId: authn_user_id,
    type: 'regrade_assessment_instance',
    description: 'Regrade ' + assessment_instance_label + ' for ' + jobInfo,
  });

  // We've now triggered the callback to our caller, but we
  // continue executing below to launch the jobs themselves.

  serverJob.executeInBackground(async (job) => {
    job.info('Regrading ' + assessment_instance_label + ' for ' + jobInfo);
    const jobResult = await sqldb.callRow(
      'assessment_instances_regrade',
      [assessment_instance_id, authn_user_id],
      z.object({
        updated: z.boolean(),
        updated_question_names: z.array(z.string()),
        new_score_perc: z.number(),
        old_score_perc: z.number(),
      }),
    );
    job.info('Regrading complete');
    var regrade = jobResult;
    if (regrade.updated) {
      job.info('Questions updated: ' + regrade.updated_question_names.join(', '));
      job.info(
        'New score: ' +
          Math.floor(regrade.new_score_perc) +
          '% (was ' +
          Math.floor(regrade.old_score_perc) +
          '%)',
      );
    } else {
      job.info('No changes made');
    }
    await ltiOutcomes.updateScoreAsync(assessment_instance_id);
  });
  return serverJob.jobSequenceId;
}

export function regradeAllAssessmentInstances(assessment_id, user_id, authn_user_id, callback) {
  debug('regradeAllAssessmentInstances()');
  var params = { assessment_id };
  sqldb.queryOneRow(sql.select_regrade_assessment_info, params, function (err, result) {
    if (ERR(err, callback)) return;
    const assessment_label = result.rows[0].assessment_label;
    const course_instance_id = result.rows[0].course_instance_id;
    const course_id = result.rows[0].course_id;

    var options = {
      course_id: course_id,
      course_instance_id: course_instance_id,
      assessment_id: assessment_id,
      user_id: user_id,
      authn_user_id: authn_user_id,
      type: 'regrade_assessment',
      description: 'Regrade ' + assessment_label,
    };
    createJobSequence(options, function (err, job_sequence_id) {
      if (ERR(err, callback)) return;
      callback(null, job_sequence_id);

      // We've now triggered the callback to our caller, but we
      // continue executing below to launch the jobs themselves.

      var jobOptions = {
        course_id: course_id,
        course_instance_id: course_instance_id,
        assessment_id: assessment_id,
        user_id: user_id,
        authn_user_id: authn_user_id,
        type: 'regrade_assessment',
        description: 'Regrade ' + assessment_label,
        job_sequence_id: job_sequence_id,
        last_in_sequence: true,
      };
      createJob(jobOptions, function (err, job) {
        if (err) {
          logger.error('Error in createJob()', err);
          failJobSequence(job_sequence_id);
          return;
        }
        job.verbose('Regrading all assessment instances for ' + assessment_label);

        var params = { assessment_id };
        sqldb.query(sql.select_regrade_assessment_instances, params, function (err, result) {
          if (ERR(err, function () {})) return job.fail(err);

          var updated_count = 0;
          var error_count = 0;

          // accumulate output lines in the "output" variable and actually
          // output put them every 100 lines, to avoid spamming the updates
          var output = null;
          var output_count = 0;
          async.eachSeries(
            result.rows,
            function (row, callback) {
              var params = [row.assessment_instance_id, authn_user_id];
              sqldb.callOneRow('assessment_instances_regrade', params, function (err, result) {
                var msg;
                if (ERR(err, function () {})) {
                  logger.error('error while regrading', {
                    jobOptions,
                    row,
                    err,
                  });
                  error_count++;
                  msg = 'ERROR updating ' + row.assessment_instance_label + ' for ' + row.user_uid;
                } else {
                  var regrade = result.rows[0];
                  msg = 'Regraded ' + row.assessment_instance_label + ' for ' + row.user_uid + ': ';
                  if (regrade.updated) {
                    updated_count++;
                    msg +=
                      'New score: ' +
                      Math.floor(regrade.new_score_perc) +
                      '% (was ' +
                      Math.floor(regrade.old_score_perc) +
                      '%), ' +
                      'Questions updated: ' +
                      regrade.updated_question_names.join(', ');
                  } else {
                    msg += 'No changes made';
                  }
                }
                ltiOutcomes.updateScore(row.assessment_instance_id, (err) => {
                  if (err) {
                    msg += '\n' + 'ERROR updating score via LTI: ' + err.toString();
                  }
                  if (output == null) {
                    output = msg;
                  } else {
                    output += '\n' + msg;
                  }
                  output_count++;
                  if (output_count >= 100) {
                    job.verbose(output);
                    output = null;
                    output_count = 0;
                  }
                  callback(null);
                });
              });
            },
            function (err) {
              if (output_count > 0) {
                job.verbose(output);
              }
              if (ERR(err, function () {})) return job.fail(err);
              job.verbose('Regrading complete');
              job.verbose('Number of assessment instances updated: ' + updated_count);
              if (error_count > 0) {
                job.verbose('Number of errors: ' + error_count);
                job.fail(new Error('Errors occurred while regrading, see output for details'));
              } else {
                job.succeed();
              }
            },
          );
        });
      });
    });
  });
}
