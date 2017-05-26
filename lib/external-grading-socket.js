var ERR = require('async-stacktrace');
var _ = require('lodash');

var logger = require('./logger');
var socketServer = require('./socket-server');
var sqldb = require('./sqldb');

module.exports = {};

// This module MUST be initialized after socket-server
module.exports.init = function(callback) {
    this.namespace = socketServer.io.of('/external-grading');
    this.namespace.on('connection', this.connection);

    callback(null);
};

module.exports.connection = function(socket) {
    socket.on('getStatus', (msg, callback) => {
        if (!_.has(msg, 'grading_job_id')) {
            logger.error('socket.io getStatus called without grading_job_id');
            return;
        }

        socket.join('job-' + msg.grading_job_id);

        module.exports.getStatus(msg.grading_job_id, (err, status) => {
            if (ERR(err, () => logger.error(err))) return;
            callback({grading_job_id: msg.grading_job_id, status: status});
        });
    });
};

module.exports.gradingLogStatusUpdated = function(grading_job_id) {
    this.getStatus(grading_job_id, (err, status) => {
        if (ERR(err, () => logger.error(err))) return;
        this.namespace.to('job-' + grading_job_id).emit('change:status', {grading_job_id: grading_job_id, status: status});
    });
};

module.exports.getStatus = function(grading_job_id, callback) {
    var params = [
        grading_job_id,
    ];
    sqldb.call('grading_job_status', params, (err, result) => {
        if (ERR(err, callback)) return;
        callback(null, result.rows[0].grading_job_status);
    });
};
