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

// This module MUST be initialized after socket-server
module.exports.init = function(callback) {
    this.namespace = socketServer.io.of('/external-grading');
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

        module.exports.getStatus(msg.job_id, (err, status) => {
            if (ERR(err, () => {console.log(err)})) return;
            callback({job_id: msg.job_id, status: status});
        });
    });
};

module.exports.gradingJobStatusUpdated = function(job_id) {
    this.getStatus(job_id, (err, status) => {
        if (ERR(err, () => {console.log(err)})) return;
        this.namespace.to('job-' + job_id).emit('change:status', {job_id: job_id, status: status});
    });
};

module.exports.getStatus = function(grading_log_id, callback) {
    var params = [
        grading_log_id,
    ];
    sqldb.call('grading_log_status', params, (err, result) => {
        if (ERR(err, callback)) return;
        callback(null, result.rows[0].grading_log_status);
    });
};
