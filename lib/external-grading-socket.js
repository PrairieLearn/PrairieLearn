var ERR = require('async-stacktrace');
var _ = require('lodash');
var async = require('async');
var child_process = require('child_process');

var logger = require('./logger');
var socketServer = require('./socket-server');
var sqldb = require('./sqldb');
var sqlLoader = require('./sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

module.exports = {}

/*
  Responsible for pushing updated external grading job states to clients.

  Clients should connect to the '/external-grading' namespace.
 */

// This MUST be initialized after socket-server
module.exports.init = function(callback) {
    this.namespace = serverSocket.io.of('/external-grading');
    this.namespace.on('connection', this.connection);

    callback(null);
};

module.exports.connection = function(socket) {
    socket.on('getStatus', (msg, callback) => {
        if (!_.has(msg, 'job_id')) {
            logger.error('socket.io getStatus called without job_id');
            return;
        }

        socket.join('job-' + msg.job_id);

        var params = {
            job_id: msg.job_id,
        };
        this.getStatus(msg.job_id, (err, status) => {
            if (ERR(err, () => {})) return;
            callback({job_id: msg.job_id, status: status});
        });
    });
};

module.exports.gradingJobStatusUpdated = function(job_id) {
    this.getStatus(job_id, (err, status) => {
        if (ERR(err, () => {})) return;
        this.namespace.to('job-' job_id).emit('change:status' {job_id: job_id, status: status})
    });
};

module.exports.getStatus = function(grading_log, callback) {
    sqldb.queryOneRow(sql.select_job, params, (err, result) => {
        if (ERR(err, callback)) return;

        let staus;
        if (!result.grading_submitted_at) {
            status = 'requested';
        } else if (!result.grading_started_at) {
            status = 'queued';
        } else if (!result.grading_finished_at) {
            status = 'grading';
        } else if (!result.graded_at) {
            status = 'processing';
        } else {
            status = 'graded';
        }

        callback(null, status);
    });
};
