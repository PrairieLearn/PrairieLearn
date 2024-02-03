//@ts-check
const ERR = require('async-stacktrace');
const _ = require('lodash');
import { checkSignedToken } from '@prairielearn/signed-token';
import { logger } from '@prairielearn/logger';
import * as sqldb from '@prairielearn/postgres';
import * as Sentry from '@prairielearn/sentry';

import { config } from './config';
import { renderPanelsForSubmission } from './question-render';
import * as socketServer from './socket-server';

const sql = sqldb.loadSqlEquiv(__filename);

/** @type {import('socket.io').Namespace} */
let namespace;

// This module MUST be initialized after socket-server
export function init(callback) {
  namespace = socketServer.io.of('/external-grading');
  namespace.on('connection', connection);

  callback(null);
}

/**
 * @param {import('socket.io').Socket} socket
 */
export function connection(socket) {
  socket.on('init', (msg, callback) => {
    if (!ensureProps(msg, ['variant_id', 'variant_token'])) {
      return callback(null);
    }
    if (!checkToken(msg.variant_token, msg.variant_id)) {
      return callback(null);
    }

    socket.join(`variant-${msg.variant_id}`);

    getVariantSubmissionsStatus(msg.variant_id, (err, submissions) => {
      if (
        ERR(err, (err) => {
          logger.error('Error getting variant submissions status', err);
          Sentry.captureException(err);
        })
      ) {
        return;
      }
      callback({ variant_id: msg.variant_id, submissions });
    });
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
          questionScorePanel: panels.questionScorePanel,
          assessmentScorePanel: panels.assessmentScorePanel,
          questionPanelFooter: panels.questionPanelFooter,
          questionNavNextButton: panels.questionNavNextButton,
        });
      },
      (err) => {
        logger.error('Error rendering panels for submission', err);
        Sentry.captureException(err);
      },
    );
  });
}

export function getVariantSubmissionsStatus(variant_id, callback) {
  const params = {
    variant_id,
  };
  sqldb.query(sql.select_submissions_for_variant, params, (err, result) => {
    if (ERR(err, callback)) return;
    callback(null, result.rows);
  });
}

export function gradingJobStatusUpdated(grading_job_id) {
  const params = { grading_job_id };
  sqldb.queryOneRow(sql.select_submission_for_grading_job, params, (err, result) => {
    if (
      ERR(err, (err) => {
        logger.error('Error selecting submission for grading job', err);
        Sentry.captureException(err);
      })
    ) {
      return;
    }
    const eventData = {
      variant_id: result.rows[0].variant_id,
      submissions: result.rows,
    };
    namespace.to(`variant-${result.rows[0].variant_id}`).emit('change:status', eventData);
  });
}

function ensureProps(data, props) {
  for (const prop of props) {
    if (!_.has(data, prop)) {
      logger.error(`socket.io external grader connected without ${prop}`);
      return false;
    }
  }
  return true;
}

function checkToken(token, variantId) {
  const data = {
    variantId,
  };
  const valid = checkSignedToken(token, data, config.secretKey, {
    maxAge: 24 * 60 * 60 * 1000,
  });
  if (!valid) {
    logger.error(`CSRF token for variant ${variantId} failed validation.`);
  }
  return valid;
}
