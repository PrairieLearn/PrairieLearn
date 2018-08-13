var ERR = require('async-stacktrace');
var _ = require('lodash');
var async = require('async');
var child_process = require('child_process');

var logger = require('./logger');
var socketServer = require('./socket-server');
var sqldb = require('@prairielearn/prairielib/sql-db');
var sqlLoader = require('@prairielearn/prairielib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

/*
  SocketIO configuration

  ##########################################
  Room 'job-231' for job_id = 231 in DB.

  Receives messages:
  'joinJob', arguments: job_id, returns: status, stderr, stdout, output

  Sends messages:
  'change:stderr', arguments: job_id, stderr
  'change:stdout', arguments: job_id, stdout
  'change:output', arguments: job_id, output
  'update', arguments: job_id

  ##########################################
  Room 'jobSequence-593' for job_sequence_id = 593 in DB.

  Receives messages:
  'joinJobSequence', arguments: job_sequence_id, returns: job_count

  Sends messages:
  'update', arguments: job_sequence_id

  ##########################################

  'update' events are sent for bulk changes to the object when
  there is no specific 'change' event available.

  For example, an 'update' will not be sent when stderr changes
  because the more specific 'change:stderr' event will be sent
  instead.
*/

module.exports = {
    // Store currently active job information in memory. This is used
    // to accumulate stderr/stdout, which are only written to the DB
    // once the job is finished.
    liveJobs: {},
};

/********************************************************************/

function Job(id, options) {
    this.id = id;
    this.options = options;
    this.stderr = '';
    this.stdout = '';
    this.output = '';
}

Job.prototype.addToStderr = function(text) {
    this.stderr += text;
    this.output += text;
    socketServer.io.to('job-' + this.id).emit('change:stderr', {job_id: this.id, stderr: this.stderr});
    socketServer.io.to('job-' + this.id).emit('change:output', {job_id: this.id, output: this.output});
};

Job.prototype.addToStdout = function(text) {
    this.stdout += text;
    this.output += text;
    socketServer.io.to('job-' + this.id).emit('change:stdout', {job_id: this.id, stdout: this.stdout});
    socketServer.io.to('job-' + this.id).emit('change:output', {job_id: this.id, output: this.output});
};

Job.prototype.error = function(msg) {
    this.addToStderr(msg + '\n');
};

Job.prototype.warn = function(msg) {
    this.addToStdout(msg + '\n');
};

Job.prototype.info = function(msg) {
    this.addToStdout(msg + '\n');
};

Job.prototype.verbose = function(msg) {
    this.addToStdout(msg + '\n');
};

Job.prototype.debug = function(_msg) {
    // do nothing
};

Job.prototype.finish = function(code, signal) {
    var that = this;
    var params = {
        job_id: that.id,
        stderr: that.stderr,
        stdout: that.stdout,
        output: that.output,
        exit_code: code,
        exit_signal: signal,
    };
    sqldb.queryOneRow(sql.update_job_on_close, params, function(err, result) {
        delete module.exports.liveJobs[that.id];
        socketServer.io.to('job-' + that.id).emit('update');
        if (that.options.job_sequence_id != null) {
            socketServer.io.to('jobSequence-' + that.options.job_sequence_id).emit('update');
        }
        if (ERR(err, function() {})) {
            logger.error('error updating job_id ' + that.id + ' on close', err);
            if (that.options.on_error) {
                that.options.on_error(that.id, err);
            }
        } else {
            var status = result.rows[0].status;
            if (status == 'Success') {
                if (that.options.on_success) {
                    that.options.on_success(that.id);
                }
            } else {
                if (that.options.on_error) {
                    that.options.on_error(that.id, new Error('Job terminated with error'));
                }
            }
        }
    });
};

Job.prototype.succeed = function() {
    this.finish(0, null);
};

Job.prototype.fail = function(err, callback) {
    var that = this;
    var errMsg = err.toString();
    that.addToStderr(errMsg);
    if (_.has(err, 'stack')) {
        that.addToStderr('\n' + err.stack);
    }
    if (_.has(err, 'data')) {
        that.addToStderr('\n' + JSON.stringify(err.data, null, '    '));
    }
    var params = {
        job_id: that.id,
        stderr: that.stderr,
        stdout: that.stdout,
        output: that.output,
        error_message: errMsg,
    };
    sqldb.query(sql.update_job_on_error, params, function(err, _result) {
        delete module.exports.liveJobs[that.id];
        socketServer.io.to('job-' + that.id).emit('update');
        if (that.options.job_sequence_id != null) {
            socketServer.io.to('jobSequence-' + that.options.job_sequence_id).emit('update');
        }
        if (ERR(err, function() {})) {
            logger.error('error updating job_id ' + that.id + ' on error', err);
            if (callback) return callback(err);
            if (that.options.on_error) {
                that.options.on_error(that.id, err);
            }
        } else {
            if (callback) return callback(null);
            if (that.options.on_error) {
                that.options.on_error(that.id, err);
            }
        }
    });
};

/********************************************************************/

module.exports.init = function(callback) {
    socketServer.io.on('connection', this.connection);
    callback(null);
};

module.exports.connection = function(socket) {
    socket.on('joinJob', function(msg, callback) {
        if (!_.has(msg, 'job_id')) {
            logger.error('socket.io joinJob called without job_id');
            return;
        }
        // FIXME: check authn/authz with socket.request
        socket.join('job-' + msg.job_id);
        var params = {
            job_id: msg.job_id,
        };
        sqldb.queryOneRow(sql.select_job, params, function(err, result) {
            if (err) return logger.error('socket.io joinJob error selecting job_id ' + msg.job_id, err);
            var status = result.rows[0].status;
            var stderr = result.rows[0].stderr;
            var stdout = result.rows[0].stdout;
            var output = result.rows[0].output;

            if (module.exports.liveJobs[msg.job_id]) {
                stderr = module.exports.liveJobs[msg.job_id].stderr;
                stdout = module.exports.liveJobs[msg.job_id].stdout;
                output = module.exports.liveJobs[msg.job_id].output;
            }
            callback({status: status, stderr: stderr, stdout: stdout, output: output});
        });
    });

    socket.on('joinJobSequence', function(msg, callback) {
        if (!_.has(msg, 'job_sequence_id')) {
            logger.error('socket.io joinJobSequence called without job_sequence_id');
            return;
        }
        // FIXME: check authn/authz with socket.request
        socket.join('jobSequence-' + msg.job_id);
        var params = {
            job_sequence_id: msg.job_sequence_id,
        };
        sqldb.queryOneRow(sql.select_job_sequence, params, function(err, result) {
            if (err) return logger.error('socket.io joinJobSequence error selecting job_sequence_id ' + msg.job_sequence_id, err);
            var job_count = result.rows[0].job_count;

            callback({job_count: job_count});
        });
    });
};

module.exports.createJob = function(options, callback) {
    options = _.assign({
        course_id: null,
        course_instance_id: null,
        assessment_id: null,
        user_id: null,
        authn_user_id: null,
        job_sequence_id: null,
        last_in_sequence: false,
        type: null,
        description: null,
        command: null,
        arguments: [],
        working_directory: undefined,
        env: process.env,
        on_error: undefined,
        on_success: undefined,
    }, options);

    var params = {
        course_id: options.course_id,
        course_instance_id: options.course_instance_id,
        assessment_id: options.assessment_id,
        user_id: options.user_id,
        authn_user_id: options.authn_user_id,
        job_sequence_id: options.job_sequence_id,
        last_in_sequence: options.last_in_sequence,
        type: options.type,
        description: options.description,
        command: options.command,
        arguments: options.arguments,
        working_directory: options.working_directory,
        env: options.env,
    };
    sqldb.queryOneRow(sql.insert_job, params, function(err, result) {
        if (ERR(err, callback)) return;
        var job_id = result.rows[0].id;

        var job = new Job(job_id, options);
        module.exports.liveJobs[job_id] = job;
        if (job.options.job_sequence_id != null) {
            socketServer.io.to('jobSequence-' + job.options.job_sequence_id).emit('update');
        }
        callback(null, job);
    });
};

module.exports.spawnJob = function(options, callback) {
    module.exports.createJob(options, function(err, job) {
        if (ERR(err, callback)) return;

        var spawnOptions = {
            cwd: job.options.working_directory,
            env: job.options.env,
        };
        job.proc = child_process.spawn(job.options.command, job.options.arguments, spawnOptions);

        job.proc.stderr.setEncoding('utf8');
        job.proc.stdout.setEncoding('utf8');
        job.proc.stderr.on('data', function(text) {job.addToStderr(text);});
        job.proc.stdout.on('data', function(text) {job.addToStdout(text);});
        job.proc.stderr.on('error', function(err) {job.addToStderr('ERROR: ' + err.toString() + '\n');});
        job.proc.stdout.on('error', function() {job.addToStderr('ERROR: ' + err.toString() + '\n');});

        // when a process exists, first 'exit' is fired with stdio
        // streams possibly still open, then 'close' is fired once all
        // stdio is done
        job.proc.on('exit', function(_code, _signal) { /* do nothing */ });
        job.proc.on('close', function(code, signal) {job.finish(code, signal);});
        job.proc.on('error', function(err) {job.fail(err);});

        if (callback) callback(null, job);
    });
};

module.exports.killJob = function(job_id, callback) {
    var job = module.exports.liveJobs[job_id];
    if (!job) return callback(new Error('No such job_id: ' + job_id));
    if (!job.proc) return callback(new Error('job_id ' + job_id + ' does not have proc to kill'));
    job.proc.kill();
    // this will not fire the usual on_error event on job fail
    job.fail('Killed by user', function(err) {
        if (ERR(err, callback)) return;
        callback(null);
    });
};

module.exports.errorAbandonedJobs = function(callback) {
    sqldb.query(sql.select_running_jobs, [], function(err, result) {
        if (ERR(err, callback)) return;
        async.each(result.rows, function(row, callback) {
            if (!_.has(module.exports.liveJobs, row.id)) {
                logger.debug('Job abandoned by server, id: ' + row.id);
                var params = {
                    job_id: row.id,
                    stderr: null,
                    stdout: null,
                    output: null,
                    error_message: 'Job abandoned by server',
                };
                sqldb.query(sql.update_job_on_error, params, function(err, _result) {
                    socketServer.io.to('job-' + row.id).emit('update');
                    if (row.job_sequence_id != null) {
                        socketServer.io.to('jobSequence-' + row.job_sequence_id).emit('update');
                    }
                    if (ERR(err, function() {})) {
                        logger.error('errorAbandonedJobs: error updating job on error', err);
                    }
                    callback(null);
                });
            }
        }, function(err) {
            if (ERR(err, callback)) return;

            sqldb.query(sql.error_abandoned_job_sequences, [], function(err, result) {
                if (ERR(err, callback)) return;
                result.rows.forEach(function(row) {
                    socketServer.io.to('jobSequence-' + row.id).emit('update');
                });
                callback(null);
            });
        });
    });
};

module.exports.createJobSequence = function(options, callback) {
    options = _.assign({
        course_id: null,
        course_instance_id: null,
        assessment_id: null,
        user_id: null,
        authn_user_id: null,
        type: null,
        description: null,
    }, options);

    var params = {
        course_id: options.course_id,
        course_instance_id: options.course_instance_id,
        assessment_id: options.assessment_id,
        user_id: options.user_id,
        authn_user_id: options.authn_user_id,
        type: options.type,
        description: options.description,
    };
    sqldb.queryOneRow(sql.insert_job_sequence, params, function(err, result) {
        if (ERR(err, callback)) return;
        var job_sequence_id = result.rows[0].id;

        callback(null, job_sequence_id);
    });
};

module.exports.failJobSequence = function(job_sequence_id, callback) {
    var params = {
        job_sequence_id,
    };
    sqldb.query(sql.fail_job_sequence, params, function(err, _result) {
        socketServer.io.to('jobSequence-' + job_sequence_id).emit('update');
        if (ERR(err, () => {})) {
            logger.error('error failing job_sequence_id ' + job_sequence_id + ' with error', err);
            if (callback) return callback(err);
        } else {
            if (callback) return callback(null);
        }
    });
};
