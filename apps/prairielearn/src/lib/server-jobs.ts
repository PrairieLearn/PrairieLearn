import assert from 'node:assert';
import { setTimeout as sleep } from 'node:timers/promises';

import { execa } from 'execa';
import * as shlex from 'shlex';
import type { Socket } from 'socket.io';
import { z } from 'zod';

import { logger } from '@prairielearn/logger';
import {
  execute,
  loadSqlEquiv,
  queryRow,
  queryRows,
  runInTransactionAsync,
} from '@prairielearn/postgres';
import * as Sentry from '@prairielearn/sentry';
import { checkSignedToken, generateSignedToken } from '@prairielearn/signed-token';
import { IdSchema } from '@prairielearn/zod';

import type { JobSequenceResultsData } from '../components/JobSequenceResults.js';

import { ansiToHtml, chalk } from './chalk.js';
import { config } from './config.js';
import { type EnumJobStatus, type Job, JobSchema, JobSequenceSchema } from './db-types.js';
import { JobSequenceWithJobsSchema, type JobSequenceWithTokens } from './server-jobs.types.js';
import * as socketServer from './socket-server.js';

const sql = loadSqlEquiv(import.meta.url);

interface CreateServerJobOptionsBase {
  /** The type of the job (lowercase, snake_case, no spaces) */
  type: string;
  /** A description of the job. */
  description: string;
  /** The effective user ID (res.locals.authz_data.user.id) */
  userId: string | null;
  /** The authenticated user ID (res.locals.authz_data.authn_user.id) */
  authnUserId: string | null;
  /** The course request ID */
  courseRequestId?: string;
  /**
   * Whether to report unexpected errors to Sentry. Defaults to false.
   * When enabled, errors thrown during job execution (except those from
   * `job.fail()`) will be captured and sent to Sentry with job context.
   */
  reportErrorsToSentry?: boolean;
}

type CreateServerJobOptions =
  | (CreateServerJobOptionsBase & {
      courseId?: string;
      courseInstanceId?: undefined;
      assessmentId?: undefined;
      assessmentQuestionId?: undefined;
    })
  | (CreateServerJobOptionsBase & {
      /** Required when courseInstanceId is provided. */
      courseId: string;
      courseInstanceId: string;
      assessmentId?: undefined;
      assessmentQuestionId?: undefined;
    })
  | (CreateServerJobOptionsBase & {
      /** Required when assessmentId is provided. */
      courseId: string;
      /** Required when assessmentId is provided. */
      courseInstanceId: string;
      assessmentId: string;
      assessmentQuestionId?: undefined;
    })
  | (CreateServerJobOptionsBase & {
      /** Required when assessmentQuestionId is provided. */
      courseId: string;
      /** Required when assessmentQuestionId is provided. */
      courseInstanceId: string;
      /** Required when assessmentQuestionId is provided. */
      assessmentId: string;
      assessmentQuestionId: string;
    });

interface ServerJobExecOptions {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  cancelSignal?: AbortSignal;
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
  exec(file: string, args: string[], options: ServerJobExecOptions): Promise<ServerJobResult>;
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
const liveJobs: Record<string, ServerJobImpl> = {};

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
  private static readonly FLUSH_INTERVAL_MS = 500;

  public jobSequenceId: string;
  public jobId: string;
  public data: Record<string, unknown> = {};
  private started = false;
  private finished = false;
  public output = '';
  private lastSent = Date.now();
  private flushTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private reportErrorsToSentry: boolean;
  private jobType: string;
  private jobDescription: string;

  constructor(
    jobSequenceId: string,
    jobId: string,
    options: { reportErrorsToSentry: boolean; type: string; description: string },
  ) {
    this.jobSequenceId = jobSequenceId;
    this.jobId = jobId;
    this.reportErrorsToSentry = options.reportErrorsToSentry;
    this.jobType = options.type;
    this.jobDescription = options.description;
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
    this.addToOutput(chalk.dim(msg) + '\n');
  }

  async exec(
    file: string,
    args: string[],
    options: ServerJobExecOptions,
  ): Promise<ServerJobResult> {
    this.addToOutput(chalk.blueBright(`Command: ${shlex.join([file, ...args])}\n`));
    this.addToOutput(chalk.blueBright(`Working directory: ${options.cwd}\n`));

    const start = performance.now();
    let didOutput = false as boolean;
    const proc2 = execa(file, args, {
      ...options,
      all: true,
    });
    proc2.all.setEncoding('utf-8');
    proc2.all.on('data', (data) => {
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
      this.addToOutput(chalk.dim(`Command completed in ${duration}ms`) + '\n\n');
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
    void this.executeInternal(fn, false);
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
      // Report unexpected errors to Sentry if enabled.
      // ServerJobAbortError is expected (thrown by job.fail()) and should not be reported.
      if (this.reportErrorsToSentry && !(err instanceof ServerJobAbortError)) {
        Sentry.captureException(err, {
          tags: {
            'job_sequence.id': this.jobSequenceId,
            'job_sequence.type': this.jobType,
          },
          extra: {
            description: this.jobDescription,
          },
        });
      }

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
    this.flush();
  }

  private flush(force = false) {
    const elapsed = Date.now() - this.lastSent;

    if (elapsed >= ServerJobImpl.FLUSH_INTERVAL_MS || force) {
      // Clear any pending trailing flush since we're flushing now.
      if (this.flushTimeoutId) {
        clearTimeout(this.flushTimeoutId);
        this.flushTimeoutId = null;
      }

      this.doFlush();
    } else if (!this.flushTimeoutId) {
      // Schedule a trailing flush to ensure buffered output is sent
      // even if no more output arrives.
      this.flushTimeoutId = setTimeout(() => {
        this.flushTimeoutId = null;
        this.doFlush();
      }, ServerJobImpl.FLUSH_INTERVAL_MS - elapsed);
    }
  }

  private doFlush() {
    const ansifiedOutput = ansiToHtml(this.output);
    socketServer.io
      ?.to('job-' + this.jobId)
      .emit('change:output', { job_id: this.jobId, output: ansifiedOutput });
    this.lastSent = Date.now();
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

    // Cancel any pending trailing flush and force a final send to ensure all
    // output (including error details above) is shown before cleanup.
    if (this.flushTimeoutId) {
      clearTimeout(this.flushTimeoutId);
      this.flushTimeoutId = null;
    }
    this.flush(true);

    delete liveJobs[this.jobId];

    await execute(sql.update_job_on_finish, {
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
  const { job_sequence_id, job_id } = await runInTransactionAsync(async () => {
    // NOTE: this needs to be a separate statement to ensure that the snapshot
    // that we end up reading from to get the job sequence number is actually
    // up to date. We can't just do this in the `insert_job_sequence` block.
    await execute(sql.course_advisory_lock, { course_id: options.courseId ?? null });

    return await queryRow(
      sql.insert_job_sequence,
      {
        course_id: options.courseId,
        course_instance_id: options.courseInstanceId,
        course_request_id: options.courseRequestId,
        assessment_id: options.assessmentId,
        assessment_question_id: options.assessmentQuestionId,
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
  });

  const serverJob = new ServerJobImpl(job_sequence_id, job_id, {
    reportErrorsToSentry: options.reportErrorsToSentry ?? false,
    type: options.type,
    description: options.description,
  });
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
  assert(socketServer.io);
  socketServer.io.on('connection', connection);

  // Start a periodic task to heartbeat all live jobs. We don't use a cronjob
  // for this because we want this to run for every host.
  heartbeatIntervalId = setInterval(() => {
    const jobIds = Object.keys(liveJobs);
    if (jobIds.length === 0) return;

    execute(sql.update_heartbeats, { job_ids: jobIds }).catch((err) => {
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

function connection(socket: Socket) {
  socket.on(
    'joinJob',
    function (
      msg: { job_id: string; token: string },
      callback: (msg: {
        status: JobSequenceResultsData['jobs'][0]['status'];
        output: string;
      }) => void,
    ) {
      if (!('job_id' in msg)) {
        logger.error('socket.io joinJob called without job_id');
        return;
      }

      // Check authorization of the requester.
      if (!checkSignedToken(msg.token, { jobId: msg.job_id.toString() }, config.secretKey)) {
        logger.error(`joinJob called with invalid token for job_id ${msg.job_id}`);
        return;
      }

      void socket.join('job-' + msg.job_id);
      queryRow(sql.select_job, { job_id: msg.job_id }, JobSchema).then(
        (job) => {
          const status = job.status;
          const liveJob = msg.job_id in liveJobs ? liveJobs[msg.job_id] : null;
          const output = ansiToHtml(liveJob?.output ?? job.output);
          callback({ status, output });
        },
        (err) => {
          Sentry.captureException(err);
          logger.error('socket.io joinJob error selecting job_id ' + msg.job_id, err);
        },
      );
    },
  );

  socket.on(
    'joinJobSequence',
    function (
      msg: { job_sequence_id: string; token: string },
      callback: (msg: { job_count: number }) => void,
    ) {
      if (!('job_sequence_id' in msg)) {
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

      void socket.join('jobSequence-' + msg.job_sequence_id);
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
    },
  );
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
      await execute(sql.update_job_on_error, {
        job_id: row.id,
        output: null,
        error_message: 'Job abandoned by server',
      });
    } catch (err) {
      Sentry.captureException(err);
      logger.error('errorAbandonedJobs: error updating job on error', err);
    } finally {
      socketServer.io!.to('job-' + row.id).emit('update');
      if (row.job_sequence_id != null) {
        socketServer.io!.to('jobSequence-' + row.job_sequence_id).emit('update');
      }
    }
  }

  const abandonedJobSequences = await queryRows(sql.error_abandoned_job_sequences, IdSchema);
  abandonedJobSequences.forEach(function (job_sequence_id) {
    socketServer.io!.to('jobSequence-' + job_sequence_id).emit('update');
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

/**
 * Retrieve the IDs of job sequences matching the provided filters.
 */
export async function getJobSequenceIds({
  assessment_question_id,
  course_id,
  course_instance_id,
  status,
  type,
}: {
  assessment_question_id?: string;
  course_id?: string;
  course_instance_id?: string;
  status?: EnumJobStatus;
  type?: string;
}) {
  return await queryRows(
    sql.select_job_sequence_ids,
    {
      assessment_question_id: assessment_question_id ?? null,
      course_id: course_id ?? null,
      course_instance_id: course_instance_id ?? null,
      status: status ?? null,
      type: type ?? null,
    },
    IdSchema,
  );
}
