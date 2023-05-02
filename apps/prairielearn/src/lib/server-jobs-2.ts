import AnsiUp from 'ansi_up';
import execa = require('execa');
import { z } from 'zod';
import * as Sentry from '@prairielearn/sentry';
import { logger } from '@prairielearn/logger';
import { loadSqlEquiv, queryAsync, queryValidatedOneRow } from '@prairielearn/postgres';

import serverJobs = require('./server-jobs');
import socketServer = require('./socket-server');

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
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

type ServerJobContext = Omit<ServerJob, 'execute' | 'executeInBackground'>;
type JobExecutionFunction = (context: ServerJobContext) => Promise<void>;

class ServerJob {
  public jobSequenceId: string;
  public jobId: string;
  private started = false;
  private finished = false;
  private output = '';

  constructor(jobSequenceId: string, jobId: string) {
    this.jobSequenceId = jobSequenceId;
    this.jobId = jobId;
  }

  error(msg: string) {
    this.addToOutput(msg + '\n');
  }

  warn(msg: string) {
    this.addToOutput(msg + '\n');
  }

  info(msg: string) {
    this.addToOutput(msg + '\n');
  }

  verbose(msg: string) {
    this.addToOutput(msg + '\n');
  }

  async exec(file: string, args: string[] = [], options: ServerJobExecOptions = {}): Promise<void> {
    const proc2 = execa(file, args, {
      ...options,
      reject: false,
      all: true,
    });

    proc2.all?.setEncoding('utf-8');
    proc2.all?.on('data', (data) => {
      this.addToOutput(data);
    });

    const result = await proc2;
    if (result.exitCode !== 0) {
      throw new Error(`Process exited with code ${result.exitCode}`);
    }
  }

  /**
   * Runs the job sequence and returns a Promise that resolves when the job
   * sequence has completed. The returned promise will not reject if the job
   * sequence fails.
   */
  async execute(fn: JobExecutionFunction): Promise<void> {
    if (this.started) {
      throw new Error('ServerJob already started');
    }
    this.started = true;

    try {
      await fn(this);
      await this.finish();
    } catch (err) {
      try {
        await this.finish(err);
      } catch (err) {
        logger.error(`Error failing job ${this.jobId}`, err);
        Sentry.captureException(err);
      }
    }
  }

  /**
   * Identical to {@link execute}, except it doesn't return a Promise. This is
   * just used as a hint to the caller that they don't need to wait for the job
   * to finish. Useful for tools like TypeScript and ESLint that ensure that
   * promises are awaited.
   */
  executeInBackground(fn: JobExecutionFunction): void {
    this.execute(fn);
  }

  private addToOutput(msg: string) {
    this.output += msg;
    const ansiUp = new AnsiUp();
    const ansifiedOutput = ansiUp.ansi_to_html(this.output);
    socketServer.io
      .to('job-' + this.jobId)
      .emit('change:output', { job_id: this.jobId, output: ansifiedOutput });
  }

  private async finish(err: any = undefined) {
    // Guard against handling job finish more than once.
    if (this.finished) return;
    this.finished = true;

    if (err) {
      // If the error has a stack, it will already include the stringified error.
      // Otherwise, just use the stringified error.
      if (err.stack) {
        this.addToOutput(err.stack);
      } else {
        this.addToOutput(err.toString());
      }

      if (err.data) {
        this.addToOutput('\n' + JSON.stringify(err.data, null, 2));
      }
    }

    delete serverJobs.liveJobs[this.jobId];

    await queryAsync(sql.update_job_on_finish, {
      job_sequence_id: this.jobSequenceId,
      job_id: this.jobId,
      output: this.output,
      status: err ? 'Error' : 'Success',
      error_message: err?.toString() ?? null,
    });

    // Notify sockets.
    socketServer.io.to('job-' + this.jobId).emit('update');
    socketServer.io.to('jobSequence-' + this.jobSequenceId).emit('update');
  }
}

/**
 * Creates a job sequence with a single job.
 */
export async function createServerJob(options: CreateServerJobOptions): Promise<ServerJob> {
  const { job_sequence_id, job_id } = await queryValidatedOneRow(
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
    })
  );

  return new ServerJob(job_sequence_id, job_id);
}
