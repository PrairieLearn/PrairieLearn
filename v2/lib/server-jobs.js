var ERR = require('async-stacktrace');
var _ = require('lodash');
var child_process = require('child_process');
var socketIo = require('socket.io');


var logger = require('./logger');
var sqldb = require('./sqldb');
var sqlLoader = require('./sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

module.exports = {
    liveJobs: {},
};

module.exports.init = function(server, callback) {
    this.io = new socketIo(server);

    this.io.on('connection', this.connection);

    callback(null);
};

module.exports.connection = function(socket) {
    //console.log('got connection', 'socket', socket);
    //console.log('socket.request', socket.request);

    socket.on('joinJob', function(msg, callback) {
        if (!_.has(msg, 'job_id')) {
            logger.error('socket.io joinJob called without job_id');
            return;
        }
        // FIXME: check authn/authz
        socket.join('job-' + msg.job_id);
        var params = {
            job_id: msg.job_id,
        }
        sqldb.queryOneRow(sql.select_job, params, function(err, result) {
            if (err) return logger.error('socket.io joinJob error selecting job_id ' + msg.job_id, err);
            var status = result.rows[0].status;

            callback({status: status});
        });
    });
    
    socket.on('disconnect', function(){
        //console.log('got disconnect');
    });
};

module.exports.startJob = function(jobOptions, callback) {
    jobOptions = _.assign({
        course_id: null,
        user_id: null,
        authn_user_id: null,
        parent_job_id: null,
        type: null,
        command: null,
        arguments: [],
        working_directory: undefined,
        on_error: undefined,
        on_success: undefined,
    }, jobOptions);
    var params = {
        course_id: jobOptions.course_id,
        user_id: jobOptions.user_id,
        authn_user_id: jobOptions.authn_user_id,
        parent_job_id: null,
        type: jobOptions.type,
        command: jobOptions.command,
        arguments: jobOptions.arguments,
        working_directory: jobOptions.working_directory,
        killable: true,
    };
    sqldb.queryOneRow(sql.insert_job, params, function(err, result) {
        if (ERR(err, callback)) return;
        var job_id = result.rows[0].id;

        var proc = child_process.spawn(jobOptions.command, jobOptions.arguments, {
            cwd: jobOptions.working_directory,
        });

        module.exports.liveJobs[job_id] = {
            job_id: job_id,
            proc: proc,
            jobOptions: jobOptions,
            stderrText: '',
            stdoutText: '',
        };
        var job = module.exports.liveJobs[job_id];

        proc.stderr.setEncoding('utf8');
        proc.stdout.setEncoding('utf8');

        proc.stderr.on('data', function(chunk) {
            job.stderrText += chunk;
            module.exports.io.to('job-' + job_id).emit('updateStderr', {text: job.stderrText});
        });

        proc.stdout.on('data', function(chunk) {
            job.stdoutText += chunk;
            module.exports.io.to('job-' + job_id).emit('updateStdout', {text: job.stdoutText});
        });

        proc.stderr.on('error', function(err) {
            job.stderrText += 'ERROR: ' + err.toString();
        });

        proc.stdout.on('error', function() {
            job.stdoutText += 'ERROR: ' + err.toString();
        });

        proc.on('close', function(code, signal) {
            // all stdio streams are now closed
            var params = {
                job_id: job_id,
                stderr: job.stderrText,
                stdout: job.stdoutText,
                exit_code: code,
                exit_signal: signal,
            };
            delete module.exports.liveJobs[job_id];
            sqldb.query(sql.update_job_on_close, params, function(err) {
                module.exports.io.to('job-' + job_id).emit('reload');
                if (err) {
                    logger.error('error updating job on close', err);
                    if (jobOptions.on_error) {
                        jobOptions.on_error(job_id, err);
                    }
                } else {
                    if (jobOptions.on_success) {
                        jobOptions.on_success(job_id);
                    }
                }
            });
        });

        proc.on('exit', function(code, signal) {
            // process was killed or exited, stdio may still be open
            // don't do anything here, because 'close' should handle this
        });

        proc.on('error', function(err) {
            var params = {
                job_id: job_id,
                error_message: err.toString(),
            };
            delete module.exports.liveJobs[job_id];
            sqldb.query(sql.update_job_on_error, params, function(updateErr) {
                module.exports.io.to('job-' + job_id).emit('reload');
                if (err) {
                    logger.error('error updating job on error', updateErr);
                    if (jobOptions.on_error) {
                        jobOptions.on_error(job_id, updateErr);
                    }
                } else {
                    if (jobOptions.on_error) {
                        jobOptions.on_error(job_id, err);
                    }
                }
            });
        });

        callback(null, job_id);
    });
};

module.exports.killJob = function(job_id, callback) {
    var job = liveJobs[job_id];
    if (!job) return callback(new Error('No such job_id: ' + job_id));
    job.proc.kill();
    // this will fire events on proc that might trigger job callbacks
    // FIXME: should we disable jobOptions.{on_error,on_success}?
    var params = {
        job_id: job_id,
        error_message: 'Killed by user',
    };
    sqldb.query(sql.update_job_on_error, params, function(err) {
        if (ERR(err, callback)) return;
        callback(null);
    });
};
