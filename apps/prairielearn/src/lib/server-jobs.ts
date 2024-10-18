import { setTimeout as sleep } from 'node:timers/promises';

import { AnsiUp } from 'ansi_up';
import { execa } from 'execa';
import _ from 'lodash';
import { z } from 'zod';

import { logger } from '@prairielearn/logger';
import { loadSqlEquiv, queryAsync, queryRow, queryRows } from '@prairielearn/postgres';
import * as Sentry from '@prairielearn/sentry';
import { checkSignedToken, generateSignedToken } from '@prairielearn/signed-token';

import { chalk, chalkDim } from './chalk.js';
import { config } from './config.js';
import { IdSchema, type Job, JobSchema, JobSequenceSchema } from './db-types.js';
import { type JobSequenceWithTokens, JobSequenceWithJobsSchema } from './server-jobs.types.js';
import * as socketServer from './socket-server.js';

const sql = loadSqlEquiv(import.meta.url);

interface CreateServerJobOptions {
  courseId?: string;
  courseInstanceId?: string;
  courseRequestId?: string;
  assessmentId?: string;
  userId?: string;
  authnUserId?: string;
  type: string;
  description: string;
}

interface ServerJobExecOptions {
  cwd: string;
  env?: NodeJS.ProcessEnv;
}

export interface ServerJobResult {
  data: Record<string, any>;
}

export interface ServerJobLogger {
  error(msg: string): void;
  warn(msg: string): void;
  info(msg: string): void;
  verbose(msg: string): void;
}

export interface ServerJob extends ServerJobLogger {
  fail(msg: string): never;
  exec(file: string, args?: string[], options?: ServerJobExecOptions): Promise<ServerJobResult>;
  data: Record<string, unknown>;
}

export interface ServerJobExecutor {
  jobSequenceId: string;
  execute(fn: ServerJobExecutionFunction): Promise<ServerJobResult>;
  executeUnsafe(fn: ServerJobExecutionFunction): Promise<ServerJobResult>;
  executeInBackground(fn: ServerJobExecutionFunction): void;
}

export type ServerJobExecutionFunction = (job: ServerJob) => Promise<void>;

/**
 * Store currently active job information in memory. This is used
 * to accumulate stderr/stdout, which are only written to the DB
 * once the job is finished.
 */
export const liveJobs: Record<string, ServerJobImpl> = {};

/********************************************************************/

let heartbeatIntervalId: ReturnType<typeof setInterval> | null = null;

/**
 * Internal error subclass so we can identify when `fail()` is called.
 */
class ServerJobAbortError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ServerJobAbortError';
  }
}

class ServerJobImpl implements ServerJob, ServerJobExecutor {
  public jobSequenceId: string;
  public jobId: string;
  public data: Record<string, unknown> = {};
  private started = false;
  private finished = false;
  public output = '';

  constructor(jobSequenceId: string, jobId: string) {
    this.jobSequenceId = jobSequenceId;
    this.jobId = jobId;
  }

  fail(msg: string): never {
    this.error(msg);
    throw new ServerJobAbortError(msg);
  }

  error(msg: string) {
    this.addToOutput(chalk.redBright(msg) + '\n');
  }

  warn(msg: string) {
    this.addToOutput(chalk.yellowBright(msg) + '\n');
  }

  info(msg: string) {
    this.addToOutput(msg + '\n');
  }

  verbose(msg: string) {
    this.addToOutput(chalkDim(msg) + '\n');
  }

  async exec(
    file: string,
    args: string[] = [],
    options: ServerJobExecOptions,
  ): Promise<ServerJobResult> {
    this.addToOutput(chalk.blueBright(`Command: ${file} ${args.join(' ')}\n`));
    this.addToOutput(chalk.blueBright(`Working directory: ${options.cwd}\n`));

    const start = performance.now();
    let didOutput = false;
    const proc2 = execa(file, args, {
      ...options,
      all: true,
    });
    proc2.all?.setEncoding('utf-8');
    proc2.all?.on('data', (data) => {
      didOutput = true;
      this.addToOutput(data);
    });

    try {
      await proc2;
    } finally {
      // Ensure we start a new line after all command output, but only if there
      // was in fact any output from the command.
      if (didOutput && !this.output.endsWith('\n')) {
        this.addToOutput('\n');
      }

      // Record timing information.
      const duration = (performance.now() - start).toFixed(2);
      this.addToOutput(chalkDim(`Command completed in ${duration}ms`) + '\n\n');
    }

    return { data: this.data };
  }

  /**
   * Runs the job sequence and returns a Promise that resolves when the job
   * sequence has completed, even if an error is encountered.
   */
  async execute(fn: ServerJobExecutionFunction): Promise<ServerJobResult> {
    this.checkAndMarkStarted();
    await this.executeInternal(fn, false);
    return { data: this.data };
  }

  /**
   * Runs the job sequence and returns a Promise that resolves when the job
   * sequence has completed. The returned promise will reject if the job
   * sequence fails.
   */
  async executeUnsafe(fn: ServerJobExecutionFunction): Promise<ServerJobResult> {
    this.checkAndMarkStarted();
    await this.executeInternal(fn, true);
    return { data: this.data };
  }

  /**
   * Identical to {@link execute}, except it doesn't return a Promise. This is
   * just used as a hint to the caller that they don't need to wait for the job
   * to finish. Useful for tools like TypeScript and ESLint that ensure that
   * promises are awaited.
   */
  executeInBackground(fn: ServerJobExecutionFunction): void {
    this.checkAndMarkStarted();
    this.executeInternal(fn, false);
  }

  private checkAndMarkStarted() {
    if (this.started) {
      throw new Error('ServerJob already started');
    }
    this.started = true;
  }

  private async executeInternal(
    fn: ServerJobExecutionFunction,
    shouldThrow: boolean,
  ): Promise<void> {
    try {
      await fn(this);
      await this.finish();
    } catch (err) {
      try {
        await this.finish(err);
      } catch (err) {
        logger.error(`Error failing job ${this.jobId}`, err);
        Sentry.captureException(err);
        if (shouldThrow) {
          throw err;
        }
      }
      if (shouldThrow) {
        throw err;
      }
    }
  }

  private addToOutput(msg: string) {
    this.output += msg;
    const ansiUp = new AnsiUp();
    const ansifiedOutput = ansiUp.ansi_to_html(this.output);
    socketServer.io
      ?.to('job-' + this.jobId)
      .emit('change:output', { job_id: this.jobId, output: ansifiedOutput });
  }

  private async finish(err: any = undefined) {
    // Guard against handling job finish more than once.
    if (this.finished) return;
    this.finished = true;

    // A `ServerJobAbortError` is thrown by the `fail` method. We won't print
    // any details about the error object itself, as `fail` will have already
    // printed the message. This error is just used as a form of control flow.
    if (err && !(err instanceof ServerJobAbortError)) {
      // If the error has a stack, it will already include the stringified error.
      // Otherwise, just use the stringified error.
      if (err.stack) {
        this.error(err.stack);
      } else {
        this.error(err.toString());
      }

      if (err.data) {
        this.verbose('\n' + JSON.stringify(err.data, null, 2));
      }
    }

    delete liveJobs[this.jobId];

    await queryAsync(sql.update_job_on_finish, {
      job_sequence_id: this.jobSequenceId,
      job_id: this.jobId,
      output: this.output,
      data: this.data,
      status: err ? 'Error' : 'Success',
    });

    // Notify sockets.
    socketServer.io?.to('job-' + this.jobId).emit('update');
    socketServer.io?.to('jobSequence-' + this.jobSequenceId).emit('update');
  }
}

/**
 * Creates a job sequence with a single job.
 */
export async function createServerJob(options: CreateServerJobOptions): Promise<ServerJobExecutor> {
  const { job_sequence_id, job_id } = await queryRow(
    sql.insert_job_sequence,
    {
      course_id: options.courseId,
      course_instance_id: options.courseInstanceId,
      course_request_id: options.courseRequestId,
      assessment_id: options.assessmentId,
      user_id: options.userId,
      authn_user_id: options.authnUserId,
      type: options.type,
      description: options.description,
    },
    z.object({
      job_sequence_id: z.string(),
      job_id: z.string(),
    }),
  );

  const serverJob = new ServerJobImpl(job_sequence_id, job_id);
  liveJobs[job_id] = serverJob;
  return serverJob;
}

export async function selectJobsByJobSequenceId(jobSequenceId: string): Promise<Job[]> {
  return await queryRows(sql.select_job_output, { job_sequence_id: jobSequenceId }, JobSchema);
}

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

export function init() {
  socketServer.io.on('connection', connection);

  // Start a periodic task to heartbeat all live jobs. We don't use a cronjob
  // for this because we want this to run for every host.
  heartbeatIntervalId = setInterval(() => {
    const jobIds = Object.keys(liveJobs);
    if (jobIds.length === 0) return;

    queryAsync(sql.update_heartbeats, { job_ids: jobIds }).catch((err) => {
      Sentry.captureException(err);
      logger.error('Error updating heartbeats for live server jobs', err);
    });
  }, config.serverJobHeartbeatIntervalSec * 1000);
}

export async function stop() {
  // Wait until all jobs have finished.
  while (Object.keys(liveJobs).length > 0) {
    await sleep(100);
  }

  // Only once all jobs are finished should we stop sending heartbeats.
  if (heartbeatIntervalId) {
    clearInterval(heartbeatIntervalId);
    heartbeatIntervalId = null;
  }
}

export function connection(socket) {
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
    queryRow(sql.select_job, { job_id: msg.job_id }, JobSchema).then(
      (job) => {
        const status = job.status;

        const ansiUp = new AnsiUp();
        const output = ansiUp.ansi_to_html(liveJobs[msg.job_id]?.output ?? job.output ?? '');

        callback({ status, output });
      },
      (err) => {
        Sentry.captureException(err);
        logger.error('socket.io joinJob error selecting job_id ' + msg.job_id, err);
      },
    );
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
    queryRow(
      sql.select_job_sequence,
      { job_sequence_id: msg.job_sequence_id },
      JobSequenceSchema.extend({ job_count: z.coerce.number() }),
    ).then(
      ({ job_count }) => {
        callback({ job_count });
      },
      (err) => {
        Sentry.captureException(err);
        logger.error(
          'socket.io joinJobSequence error selecting job_sequence_id ' + msg.job_sequence_id,
          err,
        );
      },
    );
  });
}

export async function errorAbandonedJobs() {
  const abandonedJobs = await queryRows(
    sql.select_abandoned_jobs,
    { timeout_secs: config.serverJobsAbandonedTimeoutSec },
    z.object({ id: IdSchema, job_sequence_id: IdSchema.nullable() }),
  );

  for (const row of abandonedJobs) {
    logger.debug('Job abandoned by server, id: ' + row.id);
    try {
      await queryAsync(sql.update_job_on_error, {
        job_id: row.id,
        output: null,
        error_message: 'Job abandoned by server',
      });
    } catch (err) {
      Sentry.captureException(err);
      logger.error('errorAbandonedJobs: error updating job on error', err);
    } finally {
      socketServer.io.to('job-' + row.id).emit('update');
      if (row.job_sequence_id != null) {
        socketServer.io.to('jobSequence-' + row.job_sequence_id).emit('update');
      }
    }
  }

  const abandonedJobSequences = await queryRows(sql.error_abandoned_job_sequences, IdSchema);
  abandonedJobSequences.forEach(function (job_sequence_id) {
    socketServer.io.to('jobSequence-' + job_sequence_id).emit('update');
  });
}

export async function getJobSequence(
  job_sequence_id: string,
  course_id: string | null,
): Promise<JobSequenceWithTokens> {
  const jobSequence = await queryRow(
    sql.select_job_sequence_with_course_id_as_json,
    { job_sequence_id, course_id },
    JobSequenceWithJobsSchema,
  );

  // Generate a token to authorize websocket requests for this job sequence.
  const jobSequenceTokenData = { jobSequenceId: job_sequence_id.toString() };
  return {
    ...jobSequence,
    token: generateSignedToken(jobSequenceTokenData, config.secretKey),
    jobs: jobSequence.jobs.map((job) => {
      // Also generate a token for each job.
      const jobTokenData = { jobId: job.id.toString() };
      return { ...job, token: generateSignedToken(jobTokenData, config.secretKey) };
    }),
  };
}
