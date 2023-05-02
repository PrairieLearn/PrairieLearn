import _ = require('lodash');
import AnsiUp from 'ansi_up';
import child_process = require('child_process');
import { logger } from '@prairielearn/logger';
import {
  loadSqlEquiv,
  queryAsync,
  queryOneRowAsync,
  queryZeroOrOneRowAsync,
} from '@prairielearn/postgres';
import * as Sentry from '@prairielearn/sentry';

import serverJobs = require('./server-jobs');
import socketServer = require('./socket-server');

const sql = loadSqlEquiv(__filename);

type JobSequenceExecutionFunction = (
  context: Pick<JobSequence, 'runJob' | 'spawnJob'>
) => Promise<void>;

class Job {
  public readonly options: any;
  private jobSequenceId: string;
  private id: string;
  private stdout: string;
  private stderr: string;
  private output: string;
  private finished = false;

  constructor(jobSequenceId: string, id: string, options: any) {
    this.options = options;
    this.jobSequenceId = jobSequenceId;
    this.id = id;
    this.stdout = '';
    this.stderr = '';
    this.output = '';
  }

  addToStdout(msg: string) {
    this.stdout += msg;
    this.addToOutput(msg);
  }

  addToStderr(msg: string) {
    this.stderr += msg;
    this.addToOutput(msg);
  }

  addToOutput(msg: string) {
    this.output += msg;
    const ansiUp = new AnsiUp();
    const ansifiedOutput = ansiUp.ansi_to_html(this.output);
    socketServer.io
      .to('job-' + this.id)
      .emit('change:output', { job_id: this.id, output: ansifiedOutput });
  }

  error(msg: string) {
    this.addToStderr(msg + '\n');
  }

  warn(msg: string) {
    this.addToStdout(msg + '\n');
  }

  info(msg: string) {
    this.addToStdout(msg + '\n');
  }

  verbose(msg: string) {
    this.addToStdout(msg + '\n');
  }

  debug(_msg: string) {
    // do nothing
  }

  async finish(code: number | null, signal: NodeJS.Signals | null) {
    // Guard against handling job finish more than once.
    if (this.finished) return;
    this.finished = true;

    const params = {
      job_id: this.id,
      stderr: this.stderr,
      stdout: this.stdout,
      output: this.output,
      exit_code: code,
      exit_signal: signal,
    };
    const result = await queryZeroOrOneRowAsync(sql.update_job_on_close, params);
    delete serverJobs.liveJobs[this.id];

    // Notify sockets.
    socketServer.io.to('job-' + this.id).emit('update');
    if (this.options.job_sequence_id != null) {
      socketServer.io.to(`jobSequence-${this.options.job_sequence_id}`).emit('update');
    }

    if (result.rowCount > 0 && result.rows[0].status !== 'Success') {
      // TODO: not this, probably.
      logger.error('error', this);
      throw new Error('Job terminated with error');
    }
  }

  async fail(err: any) {
    // Guard against handling job finish more than once.
    if (this.finished) return;
    this.finished = true;

    // If the error has a stack, it will already include the stringified error.
    // Otherwise, just use the stringified error.
    if (err.stack) {
      this.addToStderr(err.stack);
    } else {
      this.addToStderr(err.toString());
    }

    if (err.data) {
      this.addToStderr('\n' + JSON.stringify(err.data, null, '    '));
    }

    const params = {
      job_id: this.id,
      stderr: this.stderr,
      stdout: this.stdout,
      output: this.output,
      error_message: err.toString(),
    };
    await queryZeroOrOneRowAsync(sql.update_job_on_error, params);
    delete serverJobs.liveJobs[this.id];

    // Notify sockets.
    socketServer.io.to('job-' + this.id).emit('update');
    if (this.options.job_sequence_id != null) {
      socketServer.io.to('jobSequence-' + this.options.job_sequence_id).emit('update');
    }

    // Throw error so that the job sequence can fail.
    throw err;
  }
}

class JobSequence {
  public readonly id: string;
  private started = false;

  constructor(id: string) {
    this.id = id;
  }

  async createJob(jobOptions: any) {
    // TODO: no more lodash
    const options = _.assign(
      {
        course_id: null,
        course_instance_id: null,
        course_request_id: null,
        assessment_id: null,
        user_id: null,
        authn_user_id: null,
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

    const params = {
      course_id: options.course_id,
      course_instance_id: options.course_instance_id,
      course_request_id: options.course_request_id,
      assessment_id: options.assessment_id,
      user_id: options.user_id,
      authn_user_id: options.authn_user_id,
      job_sequence_id: this.id,
      last_in_sequence: options.last_in_sequence,
      no_job_sequence_update: options.no_job_sequence_update,
      type: options.type,
      description: options.description,
      command: options.command,
      arguments: options.arguments,
      working_directory: options.working_directory,
      env: options.env,
    };
    const jobResult = await queryOneRowAsync(sql.insert_job, params);
    const jobId = jobResult.rows[0].id;
    const job = new Job(this.id, jobId, options);
    serverJobs.liveJobs[jobId] = job;
    socketServer.io.to('jobSequence-' + this.id).emit('update');

    return job;
  }

  async spawnJob(jobOptions: any) {
    const job = await this.createJob(jobOptions);

    const spawnOptions = {
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

    return new Promise((resolve, reject) => {
      proc.on('close', function (code, signal) {
        job.finish(code, signal).then(resolve, reject);
      });
      proc.on('error', function (err) {
        job.fail(err).then(resolve, reject);
      });
    });
  }

  /**
   * @template T
   * @param {any} jobOptions
   * @param {(job: Job) => Promise<T>} jobFn
   */
  async runJob<T>(jobOptions: any, jobFn: (job: Job) => Promise<T>): Promise<T> {
    const job = await this.createJob(jobOptions);

    let result: T | null = null;
    try {
      result = await jobFn(job);
      await job.finish(0, null);
    } catch (err) {
      await job.fail(err);
      throw err;
    }

    return result;
  }

  /**
   * Runs the job sequence and returns a Promise that resolves when the job
   * sequence has completed. The returned promise will not reject if the job
   * sequence fails.
   */
  execute(fn: JobSequenceExecutionFunction): Promise<void> {
    if (this.started) {
      throw new Error('JobSequence already started');
    }

    return fn({ spawnJob: this.spawnJob.bind(this), runJob: this.runJob.bind(this) })
      .then(() => {
        queryAsync(sql.finish_job_sequence, { job_sequence_id: this.id }).catch((err) => {
          logger.error(`Error finishing job sequence ${this.id}`, err);
          Sentry.captureException(err);
        });
      })
      .catch((err) => {
        // TODO: handle job sequence error. We should persist the error, but
        // what do we associate it with?
        logger.error(`Error executing job sequence ${this.id}`, err);
        queryAsync(sql.fail_job_sequence, { job_sequence_id: this.id }).catch((err) => {
          logger.error(`Error failing job sequence ${this.id}`, err);
          Sentry.captureException(err);
        });
      });
  }

  /**
   * Identical to {@link execute}, except it doesn't return a Promise. This is
   * just used as a hint to the caller that they don't need to wait for the job
   * to finish. Useful for tools like TypeScript and ESLint that ensure that
   * promises are awaited.
   */
  executeInBackground(fn: JobSequenceExecutionFunction): void {
    this.execute(fn);
  }
}

interface CreateJobSequenceOptions {
  courseId?: string;
  courseInstanceId?: string;
  courseRequestId?: string;
  assessmentId?: string;
  userId?: string;
  authnUserId?: string;
  type: string;
  description: string;
}

export async function createJobSequence(options: CreateJobSequenceOptions): Promise<JobSequence> {
  const result = await queryOneRowAsync(sql.insert_job_sequence, {
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
}
