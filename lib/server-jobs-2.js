// @ts-check

const _ = require('lodash');
const { default: AnsiUp } = require('ansi_up');

const sqldb = require('../prairielib/lib/sql-db');
const sqlLoader = require('../prairielib/lib/sql-loader');

const serverJobs = require('./server-jobs');
const socketServer = require('./socket-server');

// TODO: don't hardcode
const sql = sqlLoader.loadSqlEquiv(__dirname + '/server-jobs.js');

class Job {
  constructor(jobSequenceId, id) {
    this.jobSequenceId = jobSequenceId;
    this.id = id;
    this.stdout = '';
    this.stderr = '';
    this.output = '';
  }

  addToStdout(msg) {
    this.stdout += msg;
    this.addToOutput(msg);
  }

  addToStderr(msg) {
    this.stderr += msg;
    this.addToOutput(msg);
  }

  addToOutput(msg) {
    this.output += msg;
    const ansiUp = new AnsiUp();
    const ansifiedOutput = ansiUp.ansi_to_html(this.output);
    socketServer.io
      .to('job-' + this.id)
      .emit('change:output', { job_id: this.id, output: ansifiedOutput });
  }

  error(msg) {
    this.addToStderr(msg + '\n');
  }

  warn(msg) {
    this.addToStdout(msg + '\n');
  }

  info(msg) {
    this.addToStdout(msg + '\n');
  }

  verbose(msg) {
    this.addToStdout(msg + '\n');
  }

  debug(_msg) {
    // do nothing
  }
}

class JobSequence {
  constructor(id) {
    this.id = id;
    this.started = false;
  }

  async createJob(jobOptions) {
    // TODO: no more lodash
    const options = _.assign(
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
      jobOptions
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
    const jobResult = await sqldb.queryOneRowAsync(sql.insert_job, params);
    const jobId = jobResult.rows[0].id;
    const job = new Job(this.id, jobId);
    serverJobs.liveJobs[jobId] = job;
    socketServer.io.to('jobSequence-' + this.id).emit('update');

    return job;
  }

  async spawnJob(jobOptions) {
    const job = await this.createJob(jobOptions);

    var spawnOptions = {
      cwd: job.options.working_directory,
      env: job.options.env,
    };
    const proc = child_process.spawn(job.options.command, job.options.arguments, spawnOptions);

    proc.stderr.setEncoding('utf8');
    proc.stdout.setEncoding('utf8');
    proc.stderr.on('data', function (text) {
      job.addToStderr(text);
    });
    proc.stdout.on('data', function (text) {
      job.addToStdout(text);
    });
    proc.stderr.on('error', function (err) {
      job.addToStderr('ERROR: ' + err.toString() + '\n');
    });
    proc.stdout.on('error', function (err) {
      job.addToStderr('ERROR: ' + err.toString() + '\n');
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

    return job;
  }

  async runJob(jobOptions, jobFn) {
    const job = await this.createJob(jobOptions);
    await jobFn();
  }

  /**
   *
   * @param {({ spawnJob, runJob }) => Promise<void>} fn
   */
  execute(fn) {
    if (this.started) {
      throw new Error('JobSequence already started');
    }

    fn({ spawnJob: this.spawnJob, runJob: this.runJob })
      .then(() => {
        // TODO: handle job termination
      })
      .catch((err) => {
        // TODO: handle job error
        console.error(err);
      });
  }
}

/**
 * @typedef {Object} CreateJobSequenceOptions
 * @property {string} [courseId]
 * @property {string} [courseInstanceId]
 * @property {string} [courseRequestId]
 * @property {string} [assessmentId]
 * @property {string} [userId]
 * @property {string} [authnUserId]
 * @property {string} type
 * @property {string} description
 */

/**
 * @param {CreateJobSequenceOptions} options
 */
module.exports.createJobSequence = async function (options) {
  const result = await sqldb.queryOneRowAsync(sql.insert_job_sequence, {
    course_id: options.courseId,
    course_instance_id: options.courseInstanceId,
    course_request_id: options.courseRequestId,
    assessment_id: options.assessmentId,
    user_id: options.userId,
    authn_user_id: options.authnUserId,
    type: options.type,
    description: options.description,
  });

  const jobSequenceId = result.rows[0].id;
  return new JobSequence(jobSequenceId);
};
