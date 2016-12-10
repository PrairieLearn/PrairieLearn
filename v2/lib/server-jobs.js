var ERR = require('async-stacktrace');
var _ = require('lodash');
var child_process = require('child_process');

var logger = require('./logger');
var socketServer = require('./socket-server');
var sqldb = require('./sqldb');
var sqlLoader = require('./sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

/*
  SocketIO configuration

  ##########################################
  Room 'job-231' for job_id = 231 in DB.

  Receives messages:
  'joinJob', arguments: job_id, returns: status, stderr, stdout

  Sends messages:
  'change:stderr', arguments: job_id, stderr
  'change:stdout', arguments: job_id, stdout
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
}

Job.prototype.addToStderr = function(text) {
    this.stderr += text;
    socketServer.io.to('job-' + this.id).emit('change:stderr', {job_id: this.id, stderr: this.stderr});
};

Job.prototype.addToStdout = function(text) {
    this.stdout += text;
    socketServer.io.to('job-' + this.id).emit('change:stdout', {job_id: this.id, stdout: this.stdout});
};

Job.prototype.error = function(msg) {
    this.addToStderr(msg + '\n');
};

Job.prototype.info = function(msg) {
    this.addToStdout(msg + '\n');
};

Job.prototype.debug = function(text) {
    // do nothing
};

Job.prototype.finish = function(code, signal) {
    var that = this;
    delete module.exports.liveJobs[that.id];
    var params = {
        job_id: that.id,
        stderr: that.stderr,
        stdout: that.stdout,
        exit_code: code,
        exit_signal: signal,
    };
    sqldb.query(sql.update_job_on_close, params, function(err) {
        socketServer.io.to('job-' + that.id).emit('update');
        if (that.options.job_sequence_id != null) {
            socketServer.io.to('jobSequence-' + that.options.job_sequence_id).emit('update');
        }
        if (err) {
            logger.error('error updating job_id ' + that.id + ' on close', err);
            if (that.options.on_error) {
                that.options.on_error(that.id, err);
            }
        } else {
            if (that.options.on_success) {
                that.options.on_success(that.id);
            }
        }
    });
};

Job.prototype.succeed = function() {
    this.finish(0, null);
};

Job.prototype.fail = function(err, callback) {
    var that = this;
    delete module.exports.liveJobs[that.id];
    var params = {
        job_id: that.id,
        error_message: err.toString(),
    };
    sqldb.query(sql.update_job_on_error, params, function(updateErr) {
        socketServer.io.to('job-' + that.id).emit('update');
        if (that.options.job_sequence_id != null) {
            socketServer.io.to('jobSequence-' + that.options.job_sequence_id).emit('update');
        }
        if (err) {
            logger.error('error updating job on error', updateErr);
            if (callback) return ERR(updateErr, callback);
            if (that.options.on_error) {
                that.options.on_error(that.id, updateErr);
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
        }
        sqldb.queryOneRow(sql.select_job, params, function(err, result) {
            if (err) return logger.error('socket.io joinJob error selecting job_id ' + msg.job_id, err);
            var status = result.rows[0].status;
            var stderr = result.rows[0].stderr;
            var stdout = result.rows[0].stdout;

            if (module.exports.liveJobs[msg.job_id]) {
                stderr = module.exports.liveJobs[msg.job_id].stderr;
                stdout = module.exports.liveJobs[msg.job_id].stdout;
            }
            callback({status: status, stderr: stderr, stdout: stdout});
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
        }
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
        user_id: null,
        authn_user_id: null,
        job_sequence_id: null,
        last_in_sequence: false,
        type: null,
        command: null,
        arguments: [],
        working_directory: undefined,
        on_error: undefined,
        on_success: undefined,
    }, options);

    var params = {
        course_id: options.course_id,
        user_id: options.user_id,
        authn_user_id: options.authn_user_id,
        job_sequence_id: options.job_sequence_id,
        last_in_sequence: options.last_in_sequence,
        type: options.type,
        command: options.command,
        arguments: options.arguments,
        working_directory: options.working_directory,
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
        
        var spawnOptions = {cwd: job.options.working_directory};
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
        job.proc.on('exit', function(code, signal) { /* do nothing */ });
        job.proc.on('close', function(code, signal) {job.finish(code, signal);});
        job.proc.on('error', function(err) {job.fail(err);});

        callback(null, job);
    });
};

module.exports.killJob = function(job_id, callback) {
    var job = liveJobs[job_id];
    if (!job) return callback(new Error('No such job_id: ' + job_id));
    if (!job.proc) return callback(new Error('job_id ' + job_id + ' does not have proc to kill'));
    job.proc.kill();
    // this will not fire the usual on_error event on job fail
    job.fail('Killed by user', function(err) {
        if (ERR(err, callback)) return;
        callback(null);
    });
};
