import type { Namespace, Socket } from 'socket.io';
import { z } from 'zod';

import { logger } from '@prairielearn/logger';
import * as sqldb from '@prairielearn/postgres';
import * as Sentry from '@prairielearn/sentry';
import { checkSignedToken } from '@prairielearn/signed-token';

import { config } from './config.js';
import { IdSchema } from './db-types.js';
import { renderPanelsForSubmission } from './question-render.js';
import * as socketServer from './socket-server.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

const SubmissionForVariantSchema = z.object({
  id: IdSchema,
  grading_job_id: IdSchema.nullable(),
  grading_job_status: z.string().nullable(),
});

const SubmissionForGradingJobSchema = z.object({
  id: IdSchema,
  grading_job_id: IdSchema,
  grading_job_status: z.string(),
  variant_id: IdSchema,
});

let namespace: Namespace;

// This module MUST be initialized after socket-server
export function init() {
  namespace = socketServer.io.of('/external-grading');
  namespace.on('connection', connection);
}

export function connection(socket: Socket) {
  socket.on('init', (msg, callback) => {
    if (!ensureProps(msg, ['variant_id', 'variant_token'])) {
      return callback(null);
    }
    if (!checkToken(msg.variant_token, msg.variant_id)) {
      return callback(null);
    }

    socket.join(`variant-${msg.variant_id}`);

    getVariantSubmissionsStatus(msg.variant_id).then(
      (submissions) => {
        callback({ variant_id: msg.variant_id, submissions });
      },
      (err) => {
        logger.error('Error getting variant submissions status', err);
        Sentry.captureException(err);
      },
    );
  });

  socket.on('getResults', (msg, callback) => {
    if (
      !ensureProps(msg, [
        'question_id',
        'instance_question_id',
        'variant_id',
        'variant_token',
        'submission_id',
        'url_prefix',
        'question_context',
        'csrf_token',
        'authorized_edit',
      ])
    ) {
      return callback(null);
    }
    if (!checkToken(msg.variant_token, msg.variant_id)) {
      return callback(null);
    }

    renderPanelsForSubmission({
      submission_id: msg.submission_id,
      question_id: msg.question_id,
      instance_question_id: msg.instance_question_id,
      variant_id: msg.variant_id,
      urlPrefix: msg.url_prefix,
      questionContext: msg.question_context,
      csrfToken: msg.csrf_token,
      authorizedEdit: msg.authorized_edit,
      renderScorePanels: true,
    }).then(
      (panels) => {
        callback({
          submission_id: msg.submission_id,
          answerPanel: panels.answerPanel,
          submissionPanel: panels.submissionPanel,
          extraHeadersHtml: panels.extraHeadersHtml,
          questionScorePanel: panels.questionScorePanel,
          assessmentScorePanel: panels.assessmentScorePanel,
          questionPanelFooter: panels.questionPanelFooter,
          questionNavNextButton: panels.questionNavNextButton,
        });
      },
      (err) => {
        logger.error('Error rendering panels for submission', err);
        Sentry.captureException(err);
        callback(null);
      },
    );
  });
}

export async function getVariantSubmissionsStatus(variant_id: string) {
  return await sqldb.queryRows(
    sql.select_submissions_for_variant,
    { variant_id },
    SubmissionForVariantSchema,
  );
}

export async function gradingJobStatusUpdated(grading_job_id: string) {
  try {
    const submission = await sqldb.queryRow(
      sql.select_submission_for_grading_job,
      { grading_job_id },
      SubmissionForGradingJobSchema,
    );

    const eventData = {
      variant_id: submission.variant_id,
      submissions: [submission],
    };
    namespace.to(`variant-${submission.variant_id}`).emit('change:status', eventData);
  } catch (err) {
    logger.error('Error selecting submission for grading job', err);
    Sentry.captureException(err);
  }
}

function ensureProps(data: Record<string, any>, props: string[]): boolean {
  for (const prop of props) {
    if (!Object.hasOwn(data, prop)) {
      logger.error(`socket.io external grader connected without ${prop}`);
      Sentry.captureException(
        new Error(`socket.io external grader connected without property ${prop}`),
      );
      return false;
    }
  }
  return true;
}

function checkToken(token: string, variantId: string): boolean {
  const data = { variantId };
  const valid = checkSignedToken(token, data, config.secretKey, { maxAge: 24 * 60 * 60 * 1000 });
  if (!valid) {
    logger.error(`CSRF token for variant ${variantId} failed validation.`);
    Sentry.captureException(new Error(`CSRF token for variant ${variantId} failed validation.`));
  }
  return valid;
}
