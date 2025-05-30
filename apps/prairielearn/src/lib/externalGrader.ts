import assert from 'node:assert';

import isPlainObject from 'is-plain-obj';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import { logger } from '@prairielearn/logger';
import * as sqldb from '@prairielearn/postgres';
import * as Sentry from '@prairielearn/sentry';

import { updateCourseInstanceUsagesForGradingJob } from '../models/course-instance-usages.js';
import {
  selectOptionalGradingJobById,
  updateGradingJobAfterGrading,
} from '../models/grading-job.js';

import { config } from './config.js';
import {
  CourseSchema,
  GradingJobSchema,
  IdSchema,
  QuestionSchema,
  SubmissionSchema,
  VariantSchema,
} from './db-types.js';
import { type Grader } from './externalGraderCommon.js';
import { ExternalGraderLocal } from './externalGraderLocal.js';
import { ExternalGraderSqs } from './externalGraderSqs.js';
import * as externalGradingSocket from './externalGradingSocket.js';
import * as ltiOutcomes from './ltiOutcomes.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

const GradingJobInfoSchema = z.object({
  grading_job: GradingJobSchema,
  submission: SubmissionSchema,
  variant: VariantSchema,
  question: QuestionSchema,
  course: CourseSchema,
});

let grader: Grader | null = null;

export function init(): void {
  if (config.externalGradingUseAws) {
    logger.verbose('External grader running on AWS');
    grader = new ExternalGraderSqs();
  } else {
    // local dev mode
    logger.verbose('External grader running locally');
    grader = new ExternalGraderLocal();
  }
}

export async function beginGradingJob(grading_job_id: string): Promise<void> {
  assert(grader, 'External grader not initialized');

  const { grading_job, submission, variant, question, course } = await sqldb.queryRow(
    sql.select_grading_job_info,
    { grading_job_id },
    GradingJobInfoSchema,
  );

  if (!question.external_grading_enabled) {
    logger.verbose('External grading disabled for job id: ' + grading_job.id);

    // Make the grade 0
    const ret = {
      gradingId: grading_job.id,
      grading: {
        score: 0,
        feedback: {
          results: { succeeded: true, gradable: false },
          message: 'External grading is not enabled :(',
        },
      },
    };

    // Send the grade out for processing and display
    processGradingResult(ret).catch((err) =>
      logger.error(`Error processing results for grading job ${grading_job.id}`, err),
    );
    return;
  }

  logger.verbose(`Submitting external grading job ${grading_job.id}.`);

  const gradeRequest = grader.handleGradingRequest(
    grading_job,
    submission,
    variant,
    question,
    course,
  );
  gradeRequest.on('submit', () => {
    updateJobSubmissionTime(grading_job.id).catch((err) => {
      logger.error('Error updating job submission time', err);
      Sentry.captureException(err);
    });
  });
  gradeRequest.on('received', (receivedTime: string) => {
    // This event is only fired when running locally; this production, this
    // is handled by the SQS queue.
    updateJobReceivedTime(grading_job.id, receivedTime).catch((err) => {
      logger.error('Error updating job received time', err);
      Sentry.captureException(err);
    });
  });
  gradeRequest.on('results', (gradingResult: Record<string, any>) => {
    // This event will only be fired when running locally; in production,
    // external grader results wil be delivered via SQS.
    processGradingResult(gradingResult).then(
      () => logger.verbose(`Successfully processed grading job ${grading_job.id}`),
      (err) => logger.error(`Error processing grading job ${grading_job.id}`, err),
    );
  });
  gradeRequest.on('error', (err: Error) => {
    handleGraderError(grading_job.id, err);
  });
}

function handleGraderError(grading_job_id: string, err: Error): void {
  logger.error(`Error processing external grading job ${grading_job_id}`);
  logger.error('handleGraderError', err);
  Sentry.captureException(err);
  processGradingResult({
    gradingId: grading_job_id,
    grading: {
      score: 0,
      startTime: null,
      endTime: null,
      feedback: {
        results: { succeeded: false, gradable: false },
        message: err.toString(),
      },
    },
  }).catch((err) => {
    logger.error(`Error processing results for grading job ${grading_job_id}`, err);
    Sentry.captureException(err);
  });
}

async function updateJobSubmissionTime(grading_job_id: string): Promise<void> {
  await sqldb.queryAsync(sql.update_grading_submitted_time, {
    grading_job_id,
    grading_submitted_at: new Date().toISOString(),
  });
  await externalGradingSocket.gradingJobStatusUpdated(grading_job_id);
}

async function updateJobReceivedTime(grading_job_id: string, receivedTime: string): Promise<void> {
  await sqldb.queryAsync(sql.update_grading_received_time, {
    grading_job_id,
    grading_received_at: receivedTime,
  });
  await externalGradingSocket.gradingJobStatusUpdated(grading_job_id);
}

/**
 * Process the result of an external grading job.
 *
 * @param content - The grading job data to process.
 */
export async function processGradingResult(content: any): Promise<void> {
  try {
    if (content.grading == null || !isPlainObject(content.grading)) {
      throw new error.AugmentedError('invalid grading', { data: { content } });
    }

    if (content.grading.feedback != null && !isPlainObject(content.grading.feedback)) {
      throw new error.AugmentedError('invalid grading.feedback', { data: { content } });
    }

    // There are two "succeeded" flags in the grading results. The first
    // is at the top level and is set by `grader-host`; the second is in
    // `results` and is set by course code.
    //
    // If the top-level flag is false, that means there was a serious
    // error in the grading process and we should treat the submission
    // as not gradable. This avoids penalizing students for issues outside
    // their control.
    const jobSucceeded = !!content.grading?.feedback?.succeeded;

    const succeeded = !!(content.grading.feedback?.results?.succeeded ?? true);
    if (!succeeded) {
      content.grading.score = 0;
    }

    // The submission is only gradable if the job as a whole succeeded
    // and the course code marked it as gradable. We default to true for
    // backwards compatibility with graders that don't set this flag.
    let gradable = jobSucceeded && !!(content.grading.feedback?.results?.gradable ?? true);

    if (gradable) {
      // We only care about the score if it is gradable.
      if (typeof content.grading.score === 'undefined') {
        content.grading.feedback = {
          results: { succeeded: false, gradable: false },
          message: 'Error parsing external grading results: score was not provided.',
          original_feedback: content.grading.feedback,
        };
        content.grading.score = 0;
        gradable = false;
      }
      if (!Number.isFinite(content.grading.score)) {
        content.grading.feedback = {
          results: { succeeded: false, gradable: false },
          message: 'Error parsing external grading results: score is not a number.',
          original_feedback: content.grading.feedback,
        };
        content.grading.score = 0;
        gradable = false;
      }
      if (content.grading.score < 0 || content.grading.score > 1) {
        content.grading.feedback = {
          results: { succeeded: false, gradable: false },
          message: 'Error parsing external grading results: score is out of range.',
          original_feedback: content.grading.feedback,
        };
        content.grading.score = 0;
        gradable = false;
      }
    }

    const grading_job = await selectOptionalGradingJobById(content.gradingId);
    // Only update course instance usages if the job hasn't been graded yet. We
    // have to compute this before calling `updateGradingJobAfterGrading` below
    // because that will update `graded_at`.
    const updateUsages = grading_job && grading_job.graded_at == null;

    await updateGradingJobAfterGrading({
      grading_job_id: content.gradingId,
      received_time: content.grading.receivedTime,
      start_time: content.grading.startTime,
      finish_time: content.grading.endTime,
      format_errors: content.grading.format_errors,
      gradable,
      broken: false,
      feedback: content.grading.feedback,
      partial_scores: {},
      score: content.grading.score,
    });

    if (updateUsages) {
      // This has to come after `updateGradingJobAfterGrading` above
      // because it uses the `grading_finished_at` value updated there.
      await updateCourseInstanceUsagesForGradingJob({ grading_job_id: content.gradingId });
    }

    const assessment_instance_id = await sqldb.queryOptionalRow(
      sql.select_assessment_for_grading_job,
      { grading_job_id: content.gradingId },
      IdSchema,
    );
    if (assessment_instance_id != null) {
      await ltiOutcomes.updateScore(assessment_instance_id);
    }
  } finally {
    await externalGradingSocket.gradingJobStatusUpdated(content.gradingId);
  }
}
