// @ts-check
import * as async from 'async';
import { z } from 'zod';
import { logger } from '@prairielearn/logger';
import * as sqldb from '@prairielearn/postgres';
import * as Sentry from '@prairielearn/sentry';
const assert = require('node:assert');

import { config } from './config';
import * as externalGradingSocket from './externalGradingSocket';
const ExternalGraderSqs = require('./externalGraderSqs');
const ExternalGraderLocal = require('./externalGraderLocal');
import * as assessment from './assessment';
import {
  CourseSchema,
  QuestionSchema,
  GradingJobSchema,
  SubmissionSchema,
  VariantSchema,
} from './db-types';

const sql = sqldb.loadSqlEquiv(__filename);

const GradingJobInfoSchema = z.object({
  grading_job: GradingJobSchema,
  submission: SubmissionSchema,
  variant: VariantSchema,
  question: QuestionSchema,
  course: CourseSchema,
});

/** @typedef Grader
 * @property {(grading_job: z.infer<typeof GradingJobSchema>,
 *             submission: z.infer<typeof SubmissionSchema>,
 *             variant: z.infer<typeof VariantSchema>,
 *             question: z.infer<typeof QuestionSchema>,
 *             course: z.infer<typeof CourseSchema>) => import('events')} handleGradingRequest
 */

/** @type {Grader | null} */
let grader = null;

export function init() {
  if (config.externalGradingUseAws) {
    logger.verbose('External grader running on AWS');
    grader = new ExternalGraderSqs();
  } else {
    // local dev mode
    logger.verbose('External grader running locally');
    grader = new ExternalGraderLocal();
  }
}

/**
 * @param {string[]} grading_job_ids
 */
export async function beginGradingJobs(grading_job_ids) {
  await async.each(grading_job_ids, beginGradingJob);
}

/**
 *  @param {string} grading_job_id
 */
export async function beginGradingJob(grading_job_id) {
  assert(grader, 'External grader not initialized');

  const { grading_job, submission, variant, question, course } = await sqldb.queryRow(
    sql.select_grading_job_info,
    { grading_job_id },
    GradingJobInfoSchema,
  );

  if (!question.external_grading_enabled) {
    logger.verbose('External grading disabled for job id: ' + grading_job.id);

    // Make the grade 0
    let ret = {
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
    assessment
      .processGradingResult(ret)
      .catch((err) =>
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
  gradeRequest.on('received', (receivedTime) => {
    // This event is only fired when running locally; this production, this
    // is handled by the SQS queue.
    updateJobReceivedTime(grading_job.id, receivedTime).catch((err) => {
      logger.error('Error updating job received time', err);
      Sentry.captureException(err);
    });
  });
  gradeRequest.on('results', (gradingResult) => {
    // This event will only be fired when running locally; in production,
    // external grader results wil be delivered via SQS.
    assessment.processGradingResult(gradingResult).then(
      () => logger.verbose(`Successfully processed grading job ${grading_job.id}`),
      (err) => logger.error(`Error processing grading job ${grading_job.id}`, err),
    );
  });
  gradeRequest.on('error', (err) => {
    handleGraderError(grading_job.id, err);
  });
}

/**
 * @param {string} grading_job_id
 * @param {Error} err
 */
function handleGraderError(grading_job_id, err) {
  logger.error(`Error processing external grading job ${grading_job_id}`);
  logger.error('handleGraderError', err);
  Sentry.captureException(err);
  assessment
    .processGradingResult({
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
    })
    .catch((err) => {
      logger.error(`Error processing results for grading job ${grading_job_id}`, err);
      Sentry.captureException(err);
    });
}

/**
 * @param {string} grading_job_id
 */
async function updateJobSubmissionTime(grading_job_id) {
  await sqldb.queryAsync(sql.update_grading_submitted_time, {
    grading_job_id: grading_job_id,
    grading_submitted_at: new Date().toISOString(),
  });
  externalGradingSocket.gradingJobStatusUpdated(grading_job_id);
}

/**
 * @param {string} grading_job_id
 * @param {string} receivedTime
 */
async function updateJobReceivedTime(grading_job_id, receivedTime) {
  await sqldb.queryAsync(sql.update_grading_received_time, {
    grading_job_id: grading_job_id,
    grading_received_at: receivedTime,
  });
  externalGradingSocket.gradingJobStatusUpdated(grading_job_id);
}
