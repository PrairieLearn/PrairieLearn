import { z } from 'zod';

import { logger } from '@prairielearn/logger';
import { loadSqlEquiv, queryRow, queryRows, runInTransactionAsync } from '@prairielearn/postgres';

import { selectAssessmentInfoForJob } from '../models/assessment.js';

import { updateAssessmentInstanceGrade } from './assessment-grading.js';
import { updateAssessmentInstance } from './assessment.js';
import { assessmentInstanceLabel } from './assessment.shared.js';
import {
  AssessmentInstanceSchema,
  AssessmentSchema,
  AssessmentSetSchema,
  CourseInstanceSchema,
  CourseSchema,
  GroupSchema,
  QuestionSchema,
  UserSchema,
} from './db-types.js';
import * as ltiOutcomes from './ltiOutcomes.js';
import { createServerJob } from './server-jobs.js';

const sql = loadSqlEquiv(import.meta.url);

const RegradeAssessmentInstanceInfoSchema = z.object({
  assessment_instance: AssessmentInstanceSchema,
  assessment: AssessmentSchema,
  assessment_set: AssessmentSetSchema,
  instance_user: UserSchema.nullable(),
  instance_group: GroupSchema.nullable(),
  course_instance: CourseInstanceSchema,
  course: CourseSchema,
});
const RegradeAssessmentInstancesSchema = z.object({
  assessment_instance: AssessmentInstanceSchema,
  assessment: AssessmentSchema,
  assessment_set: AssessmentSetSchema,
  instance_user: UserSchema.nullable(),
  instance_group: GroupSchema.nullable(),
});

/**
 * @returns The job sequence ID
 */
export async function regradeAssessmentInstance(
  assessment_instance_id: string,
  user_id: string,
  authn_user_id: string,
): Promise<string> {
  const row = await queryRow(
    sql.select_regrade_assessment_instance_info,
    { assessment_instance_id },
    RegradeAssessmentInstanceInfoSchema,
  );
  const label = assessmentInstanceLabel(
    row.assessment_instance,
    row.assessment,
    row.assessment_set,
  );
  const userOrGroup = row.instance_user?.uid || `group "${row.instance_group?.name}"`;
  const serverJob = await createServerJob({
    type: 'regrade_assessment_instance',
    description: 'Regrade ' + label + ' for ' + userOrGroup,
    userId: user_id,
    authnUserId: authn_user_id,
    courseId: row.course.id,
    courseInstanceId: row.course_instance.id,
    assessmentId: row.assessment.id,
  });

  // We've now triggered the callback to our caller, but we
  // continue executing below to launch the jobs themselves.

  serverJob.executeInBackground(async (job) => {
    job.info('Regrading ' + label + ' for ' + userOrGroup);
    const regrade = await regradeSingleAssessmentInstance({
      assessment_instance_id,
      authn_user_id,
    });
    job.info('Regrading complete');
    if (regrade.updated) {
      job.info('Questions updated: ' + regrade.updatedQuestionQids.join(', '));
      job.info(
        'New score: ' +
          Math.floor(regrade.newScorePerc) +
          '% (was ' +
          Math.floor(regrade.oldScorePerc ?? 0) +
          '%)',
      );
    } else {
      job.info('No changes made');
    }
    await ltiOutcomes.updateScore(assessment_instance_id);
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
  const { assessment_label, course_instance_id, course_id } =
    await selectAssessmentInfoForJob(assessment_id);

  const serverJob = await createServerJob({
    type: 'regrade_assessment',
    description: 'Regrade ' + assessment_label,
    userId: user_id,
    authnUserId: authn_user_id,
    courseId: course_id,
    courseInstanceId: course_instance_id,
    assessmentId: assessment_id,
  });

  serverJob.executeInBackground(async (job) => {
    job.info('Regrading all assessment instances for ' + assessment_label);

    const assessment_instances = await queryRows(
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
      const label = assessmentInstanceLabel(
        row.assessment_instance,
        row.assessment,
        row.assessment_set,
      );
      const userOrGroup = row.instance_user?.uid || `group "${row.instance_group?.name}"`;
      try {
        const regrade = await regradeSingleAssessmentInstance({
          assessment_instance_id: row.assessment_instance.id,
          authn_user_id,
        });
        msg = `Regraded ${label} for ${userOrGroup}: `;
        if (regrade.updated) {
          updated_count++;
          msg += `New score: ${Math.floor(
            regrade.newScorePerc,
          )}% (was ${Math.floor(regrade.oldScorePerc ?? 0)}%), Questions updated: ${regrade.updatedQuestionQids.join(', ')}`;
        } else {
          msg += 'No changes made';
        }
        await ltiOutcomes.updateScore(row.assessment_instance.id);
      } catch (err) {
        logger.error('error while regrading', { row, err });
        error_count++;
        msg = `ERROR updating ${label} for ${userOrGroup}`;
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

async function regradeSingleAssessmentInstance({
  assessment_instance_id,
  authn_user_id,
}: {
  assessment_instance_id: string;
  authn_user_id: string;
}) {
  return await runInTransactionAsync(async () => {
    const assessmentInstance = await queryRow(
      sql.select_and_lock_assessment_instance,
      { assessment_instance_id },
      AssessmentInstanceSchema.extend({ assessment_type: AssessmentSchema.shape.type }),
    );

    const assessmentUpdated =
      assessmentInstance.assessment_type === 'Homework'
        ? await updateAssessmentInstance(
            assessment_instance_id,
            authn_user_id,
            false, // Do not trigger a grade (we'll do that below)
          )
        : false;

    const updatedQuestionQids = await queryRows(
      sql.regrade_instance_questions,
      { assessment_instance_id, authn_user_id },
      QuestionSchema.shape.qid,
    );

    const { updated: gradeUpdated, score_perc: newScorePerc } = await updateAssessmentInstanceGrade(
      {
        assessment_instance_id,
        authn_user_id,
        onlyLogIfScoreUpdated: true,
      },
    );

    return {
      updated: assessmentUpdated || updatedQuestionQids.length > 0 || gradeUpdated,
      updatedQuestionQids,
      newScorePerc,
      oldScorePerc: assessmentInstance.score_perc,
    };
  });
}
