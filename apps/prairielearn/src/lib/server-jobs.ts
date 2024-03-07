import AnsiUp from 'ansi_up';
import execa = require('execa');
import { z } from 'zod';
import * as Sentry from '@prairielearn/sentry';
import { logger } from '@prairielearn/logger';
import { loadSqlEquiv, queryAsync, queryRow, queryRows } from '@prairielearn/postgres';

import { chalk, chalkDim } from './chalk';
import * as serverJobs from './server-jobs-legacy';
import * as socketServer from './socket-server';
import { Job, JobSchema } from './db-types';

const sql = loadSqlEquiv(__filename);

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

export interface ServerJob {
  fail(msg: string): never;
  error(msg: string): void;
  warn(msg: string): void;
  info(msg: string): void;
  verbose(msg: string): void;
  exec(file: string, args?: string[], options?: ServerJobExecOptions): Promise<void>;
  data: Record<string, unknown>;
}

export interface ServerJobExecutor {
  jobSequenceId: string;
  execute(fn: ServerJobExecutionFunction): Promise<void>;
  executeUnsafe(fn: ServerJobExecutionFunction): Promise<void>;
  executeInBackground(fn: ServerJobExecutionFunction): void;
}

export type ServerJobExecutionFunction = (job: ServerJob) => Promise<void>;

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

  async exec(file: string, args: string[] = [], options: ServerJobExecOptions): Promise<void> {
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
  }

  /**
   * Runs the job sequence and returns a Promise that resolves when the job
   * sequence has completed, even if an error is encountered.
   */
  async execute(fn: ServerJobExecutionFunction): Promise<void> {
    this.checkAndMarkStarted();
    await this.executeInternal(fn, false);
  }

  /**
   * Runs the job sequence and returns a Promise that resolves when the job
   * sequence has completed. The returned promise will reject if the job
   * sequence fails.
   */
  async executeUnsafe(fn: ServerJobExecutionFunction): Promise<void> {
    this.checkAndMarkStarted();
    await this.executeInternal(fn, true);
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

    delete serverJobs.liveJobs[this.jobId];

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
  serverJobs.liveJobs[job_id] = serverJob;
  return serverJob;
}

export async function selectJobsByJobSequenceId(jobSequenceId: string): Promise<Job[]> {
  return await queryRows(sql.select_job_output, { job_sequence_id: jobSequenceId }, JobSchema);
}
