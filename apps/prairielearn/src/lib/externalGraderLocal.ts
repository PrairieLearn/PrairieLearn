import EventEmitter from 'events';
import * as os from 'os';
import * as path from 'path';

import byline from 'byline';
import Docker from 'dockerode';
import { execa } from 'execa';
import fs from 'fs-extra';
import * as shlex from 'shlex';

import { logger } from '@prairielearn/logger';
import { contains } from '@prairielearn/path-utils';
import * as sqldb from '@prairielearn/postgres';

import { config } from './config.js';
import type { Course, GradingJob, Question, Submission, Variant } from './db-types.js';
import { type Grader, buildDirectory, makeGradingResult } from './externalGraderCommon.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

export class ExternalGraderLocal implements Grader {
  handleGradingRequest(
    grading_job: GradingJob,
    submission: Submission,
    variant: Variant,
    question: Question,
    course: Course,
  ) {
    const emitter = new EventEmitter();

    const results: {
      succeeded: boolean;
      received_time?: string;
      start_time?: string;
      end_time?: string;
      job_id: string;
      timedOut?: boolean;
      message?: string;
      results?: Record<string, any> | null;
    } = {
      succeeded: false,
      job_id: grading_job.id,
    };

    const dir = getDevJobDirectory(grading_job.id);
    const hostDir = getDevHostJobDirectory(grading_job.id);
    const timeout = Math.min(
      question.external_grading_timeout ?? config.externalGradingDefaultTimeout,
      config.externalGradingMaximumTimeout,
    );

    const docker = new Docker();

    // Delay until emitter has been returned and listener attached.
    setTimeout(() => {
      emitter.emit('submit');
    }, 0);

    (async () => {
      let output = '';

      if (question.external_grading_image == null) {
        // This code should not be reached in most cases, since this scenario
        // would cause a sync error. The check is necessary, though, to avoid
        // typing errors in following lines.
        throw new Error('No external grading image specified.');
      }

      await docker.ping();

      results.received_time = new Date().toISOString();
      emitter.emit('received', results.received_time);

      await buildDirectory(dir, submission, variant, question, course);

      if (question.external_grading_entrypoint != null) {
        const entrypointFirstToken = shlex.split(question.external_grading_entrypoint)[0];
        if (
          path.isAbsolute(entrypointFirstToken) &&
          contains('/grade', entrypointFirstToken, false)
        ) {
          // Mark the entrypoint as executable if it lives in the mounted volume.
          // If it is living in the docker container then we don't have access to
          // it before we actually run it.
          try {
            await execa('chmod', [
              '+x',
              path.resolve(dir, path.relative('/grade', entrypointFirstToken)),
            ]);
          } catch {
            logger.error('Could not make file executable; continuing execution anyways');
          }
        }
      }

      if (config.externalGradingPullImagesFromDockerHub) {
        try {
          logger.info(`Pulling image ${question.external_grading_image}`);
          const stream = await docker.pull(question.external_grading_image);
          await new Promise((resolve, reject) => {
            docker.modem.followProgress(stream, (err) => (err ? reject(err) : resolve(null)));
          });
          logger.info('Successfully pulled image');
        } catch (err) {
          logger.warn(
            `Error pulling "${question.external_grading_image}" image; attempting to fall back to cached version.`,
            err,
          );
        }
      }

      const container = await docker.createContainer({
        Image: question.external_grading_image,
        // Convert {key: 'value'} to ['key=value'] and {key: null} to ['key'] for Docker API
        Env: Object.entries(question.external_grading_environment).map(([k, v]) =>
          v === null ? k : `${k}=${v}`,
        ),
        AttachStdout: true,
        AttachStderr: true,
        Tty: true,
        NetworkDisabled: !question.external_grading_enable_networking,
        HostConfig: {
          Binds: [`${hostDir}:/grade`],
          Memory: (1 << 30) * 2, // 2 GiB
          MemorySwap: (1 << 30) * 2, // same as Memory, so no access to swap
          KernelMemory: 1 << 29, // 512 MiB
          DiskQuota: 1 << 30, // 1 GiB
          IpcMode: 'private',
          CpuPeriod: 100000, // microseconds
          CpuQuota: 90000, // portion of the CpuPeriod for this container
          PidsLimit: 1024,
          Ulimits: [
            {
              // Disable core dumps, which can get very large and bloat our storage.
              Name: 'core',
              Soft: 0,
              Hard: 0,
            },
          ],
        },
        Entrypoint: question.external_grading_entrypoint
          ? shlex.split(question.external_grading_entrypoint)
          : undefined,
      });

      const stream = await container.attach({
        stream: true,
        stdout: true,
        stderr: true,
      });

      const out = byline(stream);
      out.on('data', (line) => {
        const newline = `container> ${line.toString('utf8')}`;
        logger.info(newline);
        output += newline + '\n';
      });

      await container.start();
      results.start_time = new Date().toISOString();

      const timeoutId = setTimeout(() => {
        logger.info('Timeout exceeded; killing container');
        // We don't actually need to wait for the container to be killed
        // here - the `container.wait()` below will handle that.
        container.kill().catch((err) => logger.error('Failed to kill Docker container', err));
        results.timedOut = true;
      }, timeout * 1000);

      await container.wait();
      clearTimeout(timeoutId);
      results.end_time = new Date().toISOString();

      const inspectData = await container.inspect();
      results.succeeded = !results.timedOut && inspectData.State.ExitCode === 0;

      await container.remove({
        // Remove any volumes associated with this container
        v: true,
      });

      // Save job output
      await sqldb.queryAsync(sql.update_job_output, {
        grading_job_id: grading_job.id,
        output,
      });

      // Now that the job has completed, let's extract the results from `results.json`.
      if (results.succeeded) {
        const data = await fs.readFile(path.join(dir, 'results', 'results.json'));
        try {
          if (Buffer.byteLength(data) > 1024 * 1024) {
            // Cap data size at 1MB
            results.succeeded = false;
            results.message =
              'The grading results were larger than 1MB. ' +
              'If the problem persists, please contact course staff or a proctor.';
          } else {
            try {
              results.results = JSON.parse(data.toString('utf8'));
              results.succeeded = true;
            } catch {
              results.succeeded = false;
              results.message = 'Could not parse the grading results.';
            }
          }
        } catch {
          logger.error('Could not read results.json');
          results.succeeded = false;
        }
      } else {
        results.results = null;

        if (results.timedOut) {
          results.message = `Your grading job did not complete within the time limit of ${timeout} seconds.\nPlease fix your code before submitting again.`;
        }
      }

      return makeGradingResult(grading_job.id, results);
    })()
      .then((res) => {
        emitter.emit('results', res);
      })
      .catch((err) => {
        emitter.emit('error', err);
      });

    return emitter;
  }
}

/**
 * Returns the path to the directory where the grading job files should be
 * written to while running in development (local) mode.
 *
 * If we're running natively, this should return $HOME/.pl_ag_jobs/job_<jobId>.
 * If we're running in Docker, this should return /jobs.
 */
function getDevJobDirectory(jobId: string): string {
  if (process.env.HOST_JOBS_DIR) {
    // We're probably running in Docker
    return path.join('/jobs', `job_${jobId}`);
  } else {
    // We're probably running natively
    if (process.env.JOBS_DIR) {
      // The user wants to use a custom jobs dir
      return path.join(process.env.JOBS_DIR, `job_${jobId}`);
    } else {
      return path.resolve(path.join(os.homedir(), '.pljobs', `job_${jobId}`));
    }
  }
}

/**
 * Returns the directory that should be mounted to the grading container as
 * /grade while running in development (local) mode.
 *
 * If we're running natively, this should simply return getDevJobDirectory(...).
 * If we're running in Docker, this should return $HOST_JOBS_DIR/job_<jobId>.
 */
function getDevHostJobDirectory(jobId: string): string {
  if (process.env.HOST_JOBS_DIR) {
    // We're probably running in Docker
    return path.resolve(path.join(process.env.HOST_JOBS_DIR, `job_${jobId}`));
  } else {
    // We're probably running natively
    return getDevJobDirectory(jobId);
  }
}
