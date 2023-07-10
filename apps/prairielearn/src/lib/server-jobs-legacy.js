// @ts-check
const ERR = require('async-stacktrace');
const _ = require('lodash');
const util = require('util');
const async = require('async');
const child_process = require('child_process');
const { default: AnsiUp } = require('ansi_up');

const { logger } = require('@prairielearn/logger');
const socketServer = require('./socket-server');
const sqldb = require('@prairielearn/postgres');
const { checkSignedToken, generateSignedToken } = require('@prairielearn/signed-token');
const { config } = require('./config');
const { sleep } = require('./sleep');

const sql = sqldb.loadSqlEquiv(__filename);

/*
  SocketIO configuration

  ##########################################
  Room 'job-231' for job_id = 231 in DB.

  Receives messages:
  'joinJob', arguments: job_id, returns: status, output

  Sends messages:
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

  For example, an 'update' will not be sent when output changes
  because the more specific 'change:output' event will be sent
  instead.
*/

/** @typedef {{ output: string }} AbstractJob */

/**
 * Store currently active job information in memory. This is used
 * to accumulate stderr/stdout, which are only written to the DB
 * once the job is finished.
 *
 * @type {Record<string, AbstractJob>}
 */
module.exports.liveJobs = {};

/********************************************************************/

class Job {
  constructor(id, options) {
    this.id = id;
    this.options = options;
    this.output = '';
    this.finished = false;
  }
  addToOutput(text) {
    this.output += text;
    const ansiUp = new AnsiUp();
    const ansifiedOutput = ansiUp.ansi_to_html(this.output);
    socketServer.io
      .to('job-' + this.id)
      .emit('change:output', { job_id: this.id, output: ansifiedOutput });
  }
  error(msg) {
    this.addToOutput(msg + '\n');
  }
  warn(msg) {
    this.addToOutput(msg + '\n');
  }
  info(msg) {
    this.addToOutput(msg + '\n');
  }
  verbose(msg) {
    this.addToOutput(msg + '\n');
  }
  debug(_msg) {
    // do nothing
  }
  finish(code, signal) {
    // Guard against handling job finish more than once.
    if (this.finished) return;
    this.finished = true;

    const params = {
      job_id: this.id,
      output: this.output,
      exit_code: code,
      exit_signal: signal,
    };
    sqldb.queryZeroOrOneRow(sql.update_job_on_close, params, (err, result) => {
      delete module.exports.liveJobs[this.id];

      // Notify sockets.
      socketServer.io.to('job-' + this.id).emit('update');
      if (this.options.job_sequence_id != null) {
        socketServer.io.to(`jobSequence-${this.options.job_sequence_id}`).emit('update');
      }

      // Invoke callbacks.
      if (ERR(err, function () {})) {
        logger.error(`error updating job_id ${this.id} on close`, err);
        this.options?.on_error?.(this.id, err);
      } else if (result.rowCount > 0) {
        const status = result.rows[0].status;
        if (status === 'Success') {
          this.options?.on_success?.(this.id);
        } else {
          this.options?.on_error?.(this.id, new Error('Job terminated with error'));
        }
      }
    });
  }
  succeed() {
    this.finish(0, null);
  }
  fail(err, callback) {
    // Guard against handling job finish more than once.
    if (this.finished) return;
    this.finished = true;

    var errMsg = err.toString();
    this.addToOutput(errMsg);
    if (_.has(err, 'stack')) {
      this.addToOutput('\n' + err.stack);
    }
    if (_.has(err, 'data')) {
      this.addToOutput('\n' + JSON.stringify(err.data, null, '    '));
    }
    const params = {
      job_id: this.id,
      output: this.output,
      error_message: errMsg,
    };
    sqldb.queryZeroOrOneRow(sql.update_job_on_error, params, (err) => {
      delete module.exports.liveJobs[this.id];

      // Notify sockets.
      socketServer.io.to('job-' + this.id).emit('update');
      if (this.options.job_sequence_id != null) {
        socketServer.io.to('jobSequence-' + this.options.job_sequence_id).emit('update');
      }

      // Invoke callbacks.
      if (ERR(err, function () {})) {
        logger.error('error updating job_id ' + this.id + ' on error', err);
        if (callback) return callback(err);
        this.options?.on_error?.(this.id, err);
      } else {
        if (callback) return callback(null);
        this.options?.on_error?.(this.id, err);
      }
    });
  }
  failAsync = util.promisify(this.fail.bind(this));
}

/********************************************************************/

let heartbeatIntervalId = null;

module.exports.init = function () {
  socketServer.io.on('connection', module.exports.connection);

  // Start a periodic task to heartbeat all live jobs. We don't use a cronjob
  // for this because we want this to run for every host.
  heartbeatIntervalId = setInterval(() => {
    const jobIds = Object.keys(module.exports.liveJobs);
    if (jobIds.length === 0) return;

    sqldb.queryAsync(sql.update_heartbeats, { job_ids: jobIds }).catch((err) => {
      logger.error('Error updating heartbeats for live server jobs', err);
    });
  }, config.serverJobHeartbeatIntervalSec * 1000);
};

module.exports.stop = async function () {
  // Wait until all jobs have finished.
  while (Object.keys(module.exports.liveJobs).length > 0) {
    await sleep(100);
  }

  // Only once all jobs are finished should we stop sending heartbeats.
  if (heartbeatIntervalId) {
    clearInterval(heartbeatIntervalId);
    heartbeatIntervalId = null;
  }
};

module.exports.connection = function (socket) {
  socket.on('joinJob', function (msg, callback) {
    if (!_.has(msg, 'job_id')) {
      logger.error('socket.io joinJob called without job_id');
      return;
    }

    // Check authorization of the requester.
    if (!checkSignedToken(msg.token, { jobId: msg.job_id.toString() }, config.secretKey)) {
      logger.error(`joinJob called with invalid token for job_id ${msg.job_id}`);
      return;
    }

    socket.join('job-' + msg.job_id);
    var params = {
      job_id: msg.job_id,
    };
    sqldb.queryOneRow(sql.select_job, params, function (err, result) {
      if (err) return logger.error('socket.io joinJob error selecting job_id ' + msg.job_id, err);
      const status = result.rows[0].status;

      let output;
      const ansiUp = new AnsiUp();
      if (module.exports.liveJobs[msg.job_id]) {
        output = ansiUp.ansi_to_html(module.exports.liveJobs[msg.job_id].output);
      } else {
        output = ansiUp.ansi_to_html(result.rows[0].output);
      }

      callback({ status: status, output: output });
    });
  });

  socket.on('joinJobSequence', function (msg, callback) {
    if (!_.has(msg, 'job_sequence_id')) {
      logger.error('socket.io joinJobSequence called without job_sequence_id');
      return;
    }

    // Check authorization of the requester.
    if (
      !checkSignedToken(
        msg.token,
        { jobSequenceId: msg.job_sequence_id.toString() },
        config.secretKey,
      )
    ) {
      logger.error(
        `joinJobSequence called with invalid token for job_sequence_id ${msg.job_sequence_id}`,
      );
      return;
    }

    socket.join('jobSequence-' + msg.job_id);
    var params = {
      job_sequence_id: msg.job_sequence_id,
    };
    sqldb.queryOneRow(sql.select_job_sequence, params, function (err, result) {
      if (err) {
        return logger.error(
          'socket.io joinJobSequence error selecting job_sequence_id ' + msg.job_sequence_id,
          err,
        );
      }
      var job_count = result.rows[0].job_count;

      callback({ job_count: job_count });
    });
  });
};

/**
 * @param {any} options
 * @param {(err: Error | null | undefined, job: Job) => void} callback
 */
module.exports.createJob = function (options, callback) {
  options = _.assign(
    {
      course_id: null,
      course_instance_id: null,
      course_request_id: null,
      assessment_id: null,
      user_id: null,
      authn_user_id: null,
      job_sequence_id: null,
      last_in_sequence: false,
      no_job_sequence_update: false,
      type: null,
      description: null,
      command: null,
      arguments: [],
      working_directory: undefined,
      env: process.env,
      on_error: undefined,
      on_success: undefined,
    },
    options,
  );

  var params = {
    course_id: options.course_id,
    course_instance_id: options.course_instance_id,
    course_request_id: options.course_request_id,
    assessment_id: options.assessment_id,
    user_id: options.user_id,
    authn_user_id: options.authn_user_id,
    job_sequence_id: options.job_sequence_id,
    last_in_sequence: options.last_in_sequence,
    no_job_sequence_update: options.no_job_sequence_update,
    type: options.type,
    description: options.description,
    command: options.command,
    arguments: options.arguments,
    working_directory: options.working_directory,
    env: options.env,
  };
  sqldb.queryOneRow(sql.insert_job, params, function (err, result) {
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
module.exports.createJobAsync = async (options) => {
  // we write this explicitly so that typescript knows what's going on
  const job = await util.promisify(module.exports.createJob)(options);
  return job;
};

module.exports.spawnJob = function (options, callback) {
  module.exports.createJob(options, function (err, job) {
    if (ERR(err, callback)) return;

    var spawnOptions = {
      cwd: job.options.working_directory,
      env: job.options.env,
    };
    const proc = child_process.spawn(job.options.command, job.options.arguments, spawnOptions);

    proc.stderr.setEncoding('utf8');
    proc.stdout.setEncoding('utf8');
    proc.stderr.on('data', function (text) {
      job.addToOutput(text);
    });
    proc.stdout.on('data', function (text) {
      job.addToOutput(text);
    });
    proc.stderr.on('error', function (err) {
      job.addToOutput('ERROR: ' + err.toString() + '\n');
    });
    proc.stdout.on('error', function (err) {
      job.addToOutput('ERROR: ' + err.toString() + '\n');
    });

    // when a process exists, first 'exit' is fired with stdio
    // streams possibly still open, then 'close' is fired once all
    // stdio is done
    proc.on('exit', function (_code, _signal) {
      // do nothing
    });
    proc.on('close', function (code, signal) {
      job.finish(code, signal);
    });
    proc.on('error', function (err) {
      job.fail(err);
    });

    if (callback) callback(null, job);
  });
};
module.exports.spawnJobAsync = util.promisify(module.exports.spawnJob);

module.exports.errorAbandonedJobs = async function () {
  const abandonedJobs = await sqldb.queryAsync(sql.select_abandoned_jobs, {
    timeout_secs: config.serverJobsAbandonedTimeoutSec,
  });

  await async.eachSeries(abandonedJobs.rows, async (row) => {
    logger.debug('Job abandoned by server, id: ' + row.id);
    try {
      await sqldb.queryAsync(sql.update_job_on_error, {
        job_id: row.id,
        output: null,
        error_message: 'Job abandoned by server',
      });
    } catch (err) {
      logger.error('errorAbandonedJobs: error updating job on error', err);
    } finally {
      socketServer.io.to('job-' + row.id).emit('update');
      if (row.job_sequence_id != null) {
        socketServer.io.to('jobSequence-' + row.job_sequence_id).emit('update');
      }
    }
  });

  const abandonedJobSequences = await sqldb.queryAsync(sql.error_abandoned_job_sequences, {});
  abandonedJobSequences.rows.forEach(function (row) {
    socketServer.io.to('jobSequence-' + row.id).emit('update');
  });
};

/**
 *
 * @param {any} options
 * @param {Function} callback
 */
module.exports.createJobSequence = function (options, callback) {
  options = _.assign(
    {
      course_id: null,
      course_instance_id: null,
      course_request_id: null,
      assessment_id: null,
      user_id: null,
      authn_user_id: null,
      type: null,
      description: null,
    },
    options,
  );

  var params = {
    course_id: options.course_id,
    course_instance_id: options.course_instance_id,
    course_request_id: options.course_request_id,
    assessment_id: options.assessment_id,
    user_id: options.user_id,
    authn_user_id: options.authn_user_id,
    type: options.type,
    description: options.description,
  };
  sqldb.queryOneRow(sql.insert_job_sequence, params, function (err, result) {
    if (ERR(err, callback)) return;
    var job_sequence_id = result.rows[0].id;

    callback(null, job_sequence_id);
  });
};
module.exports.createJobSequenceAsync = async (options) => {
  // we write this explicitly so that typescript knows what's going on
  const job_sequence_id = await util.promisify(module.exports.createJobSequence)(options);
  return job_sequence_id;
};

/**
 *
 * @param {string} job_sequence_id
 * @param {Function | undefined} [callback]
 */
module.exports.failJobSequence = function (job_sequence_id, callback) {
  var params = {
    job_sequence_id,
  };
  sqldb.query(sql.fail_job_sequence, params, function (err, _result) {
    socketServer.io.to('jobSequence-' + job_sequence_id).emit('update');
    if (ERR(err, () => {})) {
      logger.error('error failing job_sequence_id ' + job_sequence_id + ' with error', err);
      return callback?.(err);
    } else {
      return callback?.(null);
    }
  });
};
module.exports.failJobSequenceAsync = async (job_sequence_id) => {
  // we write this explicitly so that typescript knows what's going on
  await util.promisify(module.exports.failJobSequence)(job_sequence_id);
};

/**
 *
 * @param {string} job_sequence_id
 * @param {string | null} course_id
 * @param {(err: Error | null | undefined, jobSequence: any) => void} callback
 */
module.exports.getJobSequence = function (job_sequence_id, course_id, callback) {
  var params = {
    job_sequence_id: job_sequence_id,
    course_id: course_id,
  };
  sqldb.queryOneRow(sql.select_job_sequence_with_course_id_as_json, params, function (err, result) {
    if (ERR(err, callback)) return;

    const jobSequence = result.rows[0];

    // Generate a token to authorize websocket requests for this job sequence.
    const jobSequenceTokenData = {
      jobSequenceId: job_sequence_id.toString(),
    };
    jobSequence.token = generateSignedToken(jobSequenceTokenData, config.secretKey);

    (jobSequence.jobs ?? []).forEach((job) => {
      // Also generate a token for each job.
      const jobTokenData = { jobId: job.id.toString() };
      job.token = generateSignedToken(jobTokenData, config.secretKey);
    });

    callback(null, jobSequence);
  });
};
module.exports.getJobSequenceAsync = util.promisify(module.exports.getJobSequence);

/**
 * Resolves with a job sequence, where each job's output has been turned into
 * markup with `ansi_up`.
 *
 * @param {any} job_sequence_id
 * @param {any} course_id
 * @param {(err: Error | null, jobSequence: any) => void} callback
 */
module.exports.getJobSequenceWithFormattedOutput = function (job_sequence_id, course_id, callback) {
  module.exports.getJobSequence(job_sequence_id, course_id, (err, jobSequence) => {
    if (ERR(err, callback)) return;

    (jobSequence.jobs ?? []).forEach((job) => {
      job.output_raw = job.output;
      if (job.output) {
        const ansiup = new AnsiUp();
        job.output = ansiup.ansi_to_html(job.output);
      }
    });

    callback(null, jobSequence);
  });
};
module.exports.getJobSequenceWithFormattedOutputAsync = util.promisify(
  module.exports.getJobSequenceWithFormattedOutput,
);

// Exported so others can use it as a type.
module.exports.Job = Job;
