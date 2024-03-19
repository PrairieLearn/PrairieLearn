import { z } from 'zod';

import { logger } from '@prairielearn/logger';
import * as sqldb from '@prairielearn/postgres';

import { createServerJob } from './server-jobs';
import * as ltiOutcomes from './ltiOutcomes';
import { IdSchema } from './db-types';

const sql = sqldb.loadSqlEquiv(__filename);

const RegradeAssessmentInstanceInfoSchema = z.object({
  assessment_instance_label: z.string(),
  user_uid: z.string().nullable(),
  group_name: z.string().nullable(),
  assessment_id: IdSchema,
  course_instance_id: IdSchema,
  course_id: IdSchema,
});
const RegradeAssessmentInfoSchema = z.object({
  assessment_label: z.string(),
  course_instance_id: IdSchema,
  course_id: IdSchema,
});
const RegradeAssessmentInstancesSchema = z.object({
  assessment_instance_id: IdSchema,
  assessment_instance_label: z.string(),
  user_uid: z.string(),
});
const AssessmentInstanceRegradeSchema = z.object({
  updated: z.boolean(),
  updated_question_names: z.array(z.string()),
  new_score_perc: z.number(),
  old_score_perc: z.number(),
});

/**
 * @returns The job sequence ID
 */
export async function regradeAssessmentInstance(
  assessment_instance_id: string,
  user_id: string,
  authn_user_id: string,
): Promise<string> {
  const assessmentInstance = await sqldb.queryRow(
    sql.select_regrade_assessment_instance_info,
    { assessment_instance_id },
    RegradeAssessmentInstanceInfoSchema,
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
    const regrade = await sqldb.callRow(
      'assessment_instances_regrade',
      [assessment_instance_id, authn_user_id],
      AssessmentInstanceRegradeSchema,
    );
    job.info('Regrading complete');
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

/**
 * @returns The job sequence ID
 */
export async function regradeAllAssessmentInstances(
  assessment_id: string,
  user_id: string,
  authn_user_id: string,
): Promise<string> {
  const { assessment_label, course_instance_id, course_id } = await sqldb.queryRow(
    sql.select_regrade_assessment_info,
    { assessment_id },
    RegradeAssessmentInfoSchema,
  );

  const serverJob = await createServerJob({
    courseId: course_id,
    courseInstanceId: course_instance_id,
    assessmentId: assessment_id,
    userId: user_id,
    authnUserId: authn_user_id,
    type: 'regrade_assessment',
    description: 'Regrade ' + assessment_label,
  });

  serverJob.executeInBackground(async (job) => {
    job.info('Regrading all assessment instances for ' + assessment_label);

    const assessment_instances = await sqldb.queryRows(
      sql.select_regrade_assessment_instances,
      { assessment_id },
      RegradeAssessmentInstancesSchema,
    );

    let updated_count = 0;
    let error_count = 0;

    // accumulate output lines in the "output" variable and actually
    // output put them every 100 lines, to avoid spamming the updates

    let output: string | null = null;
    let output_count = 0;
    for (const row of assessment_instances) {
      let msg: string;
      try {
        const regrade = await sqldb.callRow(
          'assessment_instances_regrade',
          [row.assessment_instance_id, authn_user_id],
          AssessmentInstanceRegradeSchema,
        );
        msg = `Regraded ${row.assessment_instance_label} for ${row.user_uid}: `;
        if (regrade.updated) {
          updated_count++;
          msg += `New score: ${Math.floor(
            regrade.new_score_perc,
          )}% (was ${Math.floor(regrade.old_score_perc)}%), Questions updated: ${regrade.updated_question_names.join(', ')}`;
        } else {
          msg += 'No changes made';
        }
        await ltiOutcomes.updateScoreAsync(row.assessment_instance_id);
      } catch (err) {
        logger.error('error while regrading', { row, err });
        error_count++;
        msg = `ERROR updating ${row.assessment_instance_label} for ${row.user_uid}`;
      }
      output = (output == null ? '' : `${output}\n`) + msg;

      output_count++;
      if (output_count >= 100) {
        job.info(output);
        output = null;
        output_count = 0;
      }
    }
    if (output != null) {
      job.info(output);
    }
    job.info('Regrading complete');
    job.info('Number of assessment instances updated: ' + updated_count);
    if (error_count > 0) {
      job.error('Number of errors: ' + error_count);
      job.fail('Errors occurred while regrading, see output for details');
    }
  });

  return serverJob.jobSequenceId;
}
