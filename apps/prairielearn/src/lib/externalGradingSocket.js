//@ts-check
const ERR = require('async-stacktrace');
const _ = require('lodash');

const { config } = require('./config');
const { checkSignedToken } = require('@prairielearn/signed-token');
const { renderPanelsForSubmission } = require('./question-render');
const { logger } = require('@prairielearn/logger');
const socketServer = require('./socket-server');
const sqldb = require('@prairielearn/postgres');
const Sentry = require('@prairielearn/sentry');

const sql = sqldb.loadSqlEquiv(__filename);

module.exports = {};

// This module MUST be initialized after socket-server
module.exports.init = function (callback) {
  module.exports._namespace = socketServer.io.of('/external-grading');
  module.exports._namespace.on('connection', module.exports.connection);

  callback(null);
};

module.exports.connection = function (socket) {
  socket.on('init', (msg, callback) => {
    if (!ensureProps(msg, ['variant_id', 'variant_token'])) {
      return callback(null);
    }
    if (!checkToken(msg.variant_token, msg.variant_id)) {
      return callback(null);
    }

    socket.join(`variant-${msg.variant_id}`);

    module.exports.getVariantSubmissionsStatus(msg.variant_id, (err, submissions) => {
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

    renderPanelsForSubmission(
      msg.submission_id,
      msg.question_id,
      msg.instance_question_id,
      msg.variant_id,
      msg.url_prefix,
      msg.question_context,
      msg.csrf_token,
      msg.authorized_edit,
      true, // renderScorePanels
      (err, panels) => {
        if (
          ERR(err, (err) => {
            logger.error('Error rendering panels for submission', err);
            Sentry.captureException(err);
          })
        ) {
          return;
        }
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
    );
  });
};

module.exports.getVariantSubmissionsStatus = function (variant_id, callback) {
  const params = {
    variant_id,
  };
  sqldb.query(sql.select_submissions_for_variant, params, (err, result) => {
    if (ERR(err, callback)) return;
    callback(null, result.rows);
  });
};

module.exports.gradingJobStatusUpdated = function (grading_job_id) {
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
    module.exports._namespace
      .to(`variant-${result.rows[0].variant_id}`)
      .emit('change:status', eventData);
  });
};

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
