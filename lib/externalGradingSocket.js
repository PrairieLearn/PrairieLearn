const ERR = require('async-stacktrace');
const _ = require('lodash');

const config = require('./config');
const csrf = require('./csrf');
const question = require('./question');
const logger = require('./logger');
const socketServer = require('./socket-server');
const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');

const sql = sqlLoader.loadSqlEquiv(__filename);

module.exports = {};

// This module MUST be initialized after socket-server
module.exports.init = function(callback) {
    module.exports._namespace = socketServer.io.of('/external-grading');
    module.exports._namespace.on('connection', module.exports.connection);

    callback(null);
};

module.exports.connection = function(socket) {
    socket.on('init', (msg, callback) => {
        if (!ensureProps(msg, ['variant_id', 'variant_token'])) {
            return callback(null);
        }
        if (!checkToken(msg.variant_token, msg.variant_id)) {
            return callback(null);
        }

        socket.join(`variant-${msg.variant_id}`);

        module.exports.getVariantSubmissionsStatus(msg.variant_id, (err, submissions) => {
            if (ERR(err, (err) => logger.error(err))) return;
            callback({variant_id: msg.variant_id, submissions});
        });
    });

    socket.on('getResults', (msg, callback) => {
        if (!ensureProps(msg, ['variant_id', 'variant_token', 'submission_id', 'url_prefix', 'question_context', 'csrf_token'])) {
            return callback(null);
        }
        if (!checkToken(msg.variant_token, msg.variant_id)) {
            return callback(null);
        }

        module.exports.renderPanelsForSubmission(msg.submission_id, msg.url_prefix, msg.question_context, msg.csrf_token, (err, panels) => {
            if (ERR(err, (err) => logger.error(err))) return;
            callback({
                submission_id: msg.submission_id,
                submissionPanel: panels.submissionPanel,
                questionScorePanel: panels.questionScorePanel,
                assessmentScorePanel: panels.assessmentScorePanel,
                questionPanelFooter: panels.questionPanelFooter,
            });
        });
    });
};

module.exports.getVariantSubmissionsStatus = function(variant_id, callback) {
    const params = {
        variant_id,
    };
    sqldb.query(sql.select_submissions_for_variant, params, (err, result) => {
        if (ERR(err, callback)) return;
        callback(null, result.rows);
    });
};

module.exports.gradingJobStatusUpdated = function(grading_job_id) {
    const params = { grading_job_id };
    sqldb.queryOneRow(sql.select_submission_for_grading_job, params, (err, result) => {
        if (ERR(err, (err) => logger.error(err))) return;
        const eventData = {
            variant_id: result.rows[0].variant_id,
            submissions: result.rows,
        };
        module.exports._namespace.to(`variant-${result.rows[0].variant_id}`).emit('change:status', eventData);
    });
};

module.exports.renderPanelsForSubmission = function(submission_id, urlPrefix, questionContext, csrfToken, callback) {
    question.renderPanelsForSubmission(submission_id, urlPrefix, questionContext, csrfToken, (err, results) => {
        if (ERR(err, callback)) return;
        callback(null, results);
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
    const ret = csrf.checkToken(token, data, config.secretKey, {maxAge: 24 * 60 * 60 * 1000});
    if (!ret) {
        logger.error(`CSRF token for variant ${variantId} failed validation.`);
    }
    return ret;
}
