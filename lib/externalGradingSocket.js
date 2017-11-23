const ERR = require('async-stacktrace');
const _ = require('lodash');

const question = require('./question');
const logger = require('./logger');
const socketServer = require('./socket-server');
const sqldb = require('./sqldb');
const sqlLoader = require('./sql-loader');

const sql = sqlLoader.loadSqlEquiv(__filename);

module.exports = {};

// This module MUST be initialized after socket-server
module.exports.init = function(callback) {
    this.namespace = socketServer.io.of('/external-grading');
    this.namespace.on('connection', this.connection);

    callback(null);
};

module.exports.connection = function(socket) {
    socket.on('init', (msg, callback) => {
        if (!_.has(msg, 'variant_id')) {
            logger.error('socket.io external grader connected without variant_id');
            return;
        }

        socket.join(`variant-${msg.variant_id}`);

        module.exports.getVariantSubmissionsStatus(msg.variant_id, (err, submissions) => {
            if (ERR(err, (err) => logger.error(err))) return;
            callback({variant_id: msg.variant_id, submissions});
        });
    });

    socket.on('getResults', (msg, callback) => {
        if (!_.has(msg, 'submission_id')) {
            logger.error('socket.io getResults called without submission_id');
            return;
        }
        if (!_.has(msg, 'url_prefix')) {
            logger.error('socket.io getResults called without url_prefix');
            return;
        }

        module.exports.renderPanelsForSubmission(msg.submission_id, msg.url_prefix, (err, panels) => {
            if (ERR(err, (err) => logger.error(err))) return;
            callback({
                submission_id: msg.submission_id,
                submissionPanel: panels.submissionPanel,
                scorePanel: panels.scorePanel,
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
    const params = {
        grading_job_id,
    };
    sqldb.queryOneRow(sql.select_submission_for_grading_job, params, (err, result) => {
        if (ERR(err, (err) => logger.error(err))) return;
        const data = {
            variant_id: result.rows[0].variant_id,
            submissions: result.rows,
        };
        this.namespace.to(`variant-${result.rows[0].variant_id}`).emit('change:status', data);
    });
};

module.exports.renderPanelsForSubmission = function(submission_id, urlPrefix, callback) {
    question.renderPanelsForSubmission(submission_id, urlPrefix, (err, results) => {
        if (ERR(err, callback)) return;
        callback(null, results);
    });
};
