// @ts-check

const { default: AnsiUp } = require('ansi_up');

const sqldb = require('../prairielib/lib/sql-db');
const sqlLoader = require('../prairielib/lib/sql-loader');

const socketServer = require('./socket-server');

const sql = sqlLoader.loadSqlEquiv(__filename);

class Job {
  constructor(id) {
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

  /**
   *
   * @param {({ runJob}) => Promise<void>} fn
   */
  async execute(fn) {
    if (this.started) {
      throw new Error('JobSequence already started');
    }

    async function runJob(jobOptions, jobFn) {
      await jobFn();
    }

    await fn({ runJob });
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
  const result = sqldb.queryOneRow(sql.insert_job_sequence, {
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
