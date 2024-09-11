import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import * as path from 'path';

import { ECRClient } from '@aws-sdk/client-ecr';
import { S3 } from '@aws-sdk/client-s3';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { Upload } from '@aws-sdk/lib-storage';
import * as async from 'async';
import byline from 'byline';
import Docker from 'dockerode';
import { execa } from 'execa';
import fs from 'fs-extra';
import * as tmp from 'tmp-promise';

import { DockerName, setupDockerAuth } from '@prairielearn/docker-utils';
import * as sqldb from '@prairielearn/postgres';
import { run } from '@prairielearn/run';
import { sanitizeObject } from '@prairielearn/sanitize';
import * as Sentry from '@prairielearn/sentry';

import { makeAwsClientConfig, makeS3ClientConfig } from './lib/aws.js';
import { config, loadConfig } from './lib/config.js';
import { deferredPromise } from './lib/deferred.js';
import * as healthCheck from './lib/healthCheck.js';
import { type WinstonBufferedLogger, makeJobLogger } from './lib/jobLogger.js';
import * as lifecycle from './lib/lifecycle.js';
import * as load from './lib/load.js';
import globalLogger from './lib/logger.js';
import pullImages from './lib/pullImages.js';
import { type GradingJobMessage, receiveFromQueue } from './lib/receiveFromQueue.js';
import * as timeReporter from './lib/timeReporter.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

interface GradingResults {
  job_id: string;
  received_time: Date;
  start_time?: Date;
  end_time?: Date;
  succeeded?: boolean;
  timedOut?: boolean;
  results?: any;
  message?: string;
}

// catch SIGTERM and exit after waiting for all current jobs to finish
let processTerminating = false;
process.on('SIGTERM', () => {
  globalLogger.info('caught SIGTERM, draining jobs to exit...');
  processTerminating = true;
  (function tryToExit() {
    if (load.getCurrentJobs() === 0) process.exit(0);
    setTimeout(tryToExit, 1000);
  })();
});

async.series(
  [
    async () => {
      await loadConfig();
      globalLogger.info('Config loaded:');
      globalLogger.info(JSON.stringify(config, null, 2));

      if (config.sentryDsn) {
        await Sentry.init({
          dsn: config.sentryDsn,
          environment: config.sentryEnvironment,
        });
      }
      await lifecycle.init();
    },
    async () => {
      const pgConfig = {
        host: config.postgresqlHost,
        database: config.postgresqlDatabase,
        user: config.postgresqlUser,
        password: config.postgresqlPassword ?? undefined,
        max: config.postgresqlPoolSize,
        idleTimeoutMillis: config.postgresqlIdleTimeoutMillis,
      };
      function idleErrorHandler(err) {
        globalLogger.error('idle client error', err);
        Sentry.captureException(err, {
          level: 'fatal',
          tags: {
            // This may have been set by `sql-db.js`. We include this in the
            // Sentry tags to more easily debug idle client errors.
            last_query: err?.data?.lastQuery ?? undefined,
          },
        });
        Sentry.close().finally(() => process.exit(1));
      }

      globalLogger.info(
        'Connecting to database ' + pgConfig.user + '@' + pgConfig.host + ':' + pgConfig.database,
      );
      await sqldb.initAsync(pgConfig, idleErrorHandler);
      globalLogger.info('Successfully connected to database');
    },
    async () => {
      if (config.reportLoad) {
        load.init(config.maxConcurrentJobs);
      }
    },
    async () => {
      if (config.useHealthCheck) {
        await healthCheck.init();
      }
    },
    async () => {
      if (config.useImagePreloading) {
        await pullImages();
      }
    },
    async () => {
      await lifecycle.inService();
    },
    async () => {
      globalLogger.info('Initialization complete; beginning to process jobs');
      const sqs = new SQSClient(makeAwsClientConfig());

      async function worker() {
        // eslint-disable-next-line no-constant-condition
        while (true) {
          if (!healthCheck.isHealthy() || processTerminating) return;

          if (!config.jobsQueueUrl) {
            throw new Error('jobsQueueUrl is not defined');
          }

          await receiveFromQueue(sqs, config.jobsQueueUrl, async (job) => {
            globalLogger.info(`received ${job.jobId} from queue`);

            // Ensure that this job wasn't canceled in the time since job submission.
            const canceled = await isJobCanceled(job);

            if (canceled) {
              globalLogger.info(`Job ${job.jobId} was canceled; skipping job`);
              return;
            }

            await handleJob(job).then(
              () => globalLogger.info(`handleJob(${job.jobId}) succeeded`),
              (err) => {
                globalLogger.info(`handleJob(${job.jobId}) errored`, err);

                // Throwing the error will ensure that the job isn't deleted
                // from SQS and thus will be retried.
                throw err;
              },
            );
          }).catch((err) => {
            globalLogger.error('receiveFromQueue error', err);
            Sentry.captureException(err);
          });
        }
      }

      // Start an appropriate number of workers
      await Promise.all(Array.from({ length: config.maxConcurrentJobs }).map(() => worker()));
    },
  ],
  (err) => {
    Sentry.captureException(err, {
      level: 'fatal',
    });
    globalLogger.error('Error in main loop:', err);
    lifecycle
      .abandonLaunch()
      .catch((err) => {
        globalLogger.error('Error in lifecycle.abandon():', err);
      })
      .finally(() => {
        // pause to log errors, then exit
        setTimeout(() => {
          process.exit(1);
        }, 1000);
      });
  },
);

async function isJobCanceled(job: GradingJobMessage) {
  const result = await sqldb.queryOneRowAsync(sql.check_job_cancellation, {
    grading_job_id: job.jobId,
  });

  return result.rows[0].canceled;
}

async function handleJob(job: GradingJobMessage) {
  load.startJob();

  const logger = makeJobLogger();
  globalLogger.info(`Logging job ${job.jobId} to S3: ${job.s3Bucket}/${job.s3RootKey}`);

  const context = {
    docker: new Docker(),
    s3: new S3(makeS3ClientConfig({ maxAttempts: 3 })),
    logger,
    job,
  };

  logger.info(`Running job ${job.jobId}`);
  logger.info('job details:', job);

  try {
    const receivedTime = await timeReporter.reportReceivedTime(job.jobId);

    const initResults = await Promise.allSettled([
      reportReceived(context, receivedTime),
      // It's possible that this could fail for normal reasons, e.g. a Docker
      // image not existing in our cache. We'll allow this error to bubble up
      // but we won't report it to Sentry.
      initDocker(context),
      // This should never fail, but if it does, something has gone very wrong,
      // so we'll specifically report it to Sentry.
      initFiles(context).catch((err) => {
        Sentry.captureException(err);
        throw err;
      }),
    ]);

    const tempDir = initResults[2].status === 'fulfilled' ? initResults[2].value : undefined;

    const results = await run(async () => {
      const initSucceeded = initResults.every((result) => result.status === 'fulfilled');
      if (initSucceeded && tempDir) {
        return await runJob(context, receivedTime, tempDir.path);
      }

      // We failed to init, so we weren't able to run the job. We'll report
      // generic error messages as the result of the job.
      const message = run(() => {
        const dockerInitSucceeded = initResults[1].status === 'fulfilled';
        const fileInitSucceeded = initResults[2].status === 'fulfilled';

        const messages: string[] = [];
        if (!dockerInitSucceeded) {
          messages.push(`Could not pull Docker image ${job.image}.`);
        }
        if (!fileInitSucceeded) {
          messages.push('Could not initialize files for grading.');
        }

        // This should never occur, as `reportReceived` should never reject. But,
        // just in case, we'll return a generic error message.
        if (messages.length === 0) {
          return 'An unknown error occurred.';
        }

        return messages.join('\n');
      });

      return {
        job_id: job.jobId,
        received_time: receivedTime,
        start_time: new Date(),
        end_time: new Date(),
        succeeded: false,
        message,
      };
    });

    logger.info(`Job ${job.jobId} completed with results:`, results);

    try {
      await Promise.all([
        uploadResults(context, results),
        // Only attempt to upload the archive if the directory was created.
        tempDir ? uploadArchive(context, tempDir.path) : Promise.resolve(),
      ]);

      if (tempDir) {
        logger.info('Removing temporary directories');
        await tempDir.cleanup();
        logger.info('Successfully removed temporary directories');
      }
    } catch (err) {
      Sentry.captureException(err);
      throw err;
    } finally {
      // Do this last so that we capture all relevant logs.
      await uploadLogs(context).catch((err) => {
        Sentry.captureException(err);
        throw err;
      });
    }
  } finally {
    load.endJob();
  }
}

interface Context {
  docker: Docker;
  s3: S3;
  logger: WinstonBufferedLogger;
  job: GradingJobMessage;
}

async function reportReceived(context: Context, receivedTime: Date) {
  if (!config.resultsQueueUrl) {
    throw new Error('resultsQueueUrl is not defined');
  }

  const { job, logger } = context;
  logger.info('Sending job acknowledgement to PrairieLearn');

  try {
    const sqs = new SQSClient(makeAwsClientConfig());
    await sqs.send(
      new SendMessageCommand({
        QueueUrl: config.resultsQueueUrl,
        MessageBody: JSON.stringify({
          jobId: job.jobId,
          event: 'job_received',
          data: {
            receivedTime,
          },
        }),
      }),
    );
  } catch (err) {
    // We don't want to fail the job if this notification fails
    logger.error('sendMessage error:', err);
    Sentry.captureException(err);
  }
}

async function initDocker(context: Context) {
  const {
    logger,
    docker,
    job: { image },
  } = context;
  let dockerAuth = {};

  logger.info('Pinging docker');
  await docker.ping();

  if (config.cacheImageRegistry) {
    logger.info('Authenticating to docker');
    const ecr = new ECRClient(makeAwsClientConfig());
    dockerAuth = await setupDockerAuth(ecr);
  }

  logger.info(`Pulling latest version of "${image}" image`);
  const repository = new DockerName(image);
  if (config.cacheImageRegistry) {
    repository.setRegistry(config.cacheImageRegistry);
  }
  const params = {
    fromImage: repository.getRegistryRepo(),
    tag: repository.getTag() || 'latest',
  };
  logger.info(`Pulling image: ${JSON.stringify(params)}`);

  const stream = await docker.createImage(dockerAuth, params);

  await new Promise((resolve, reject) => {
    docker.modem.followProgress(
      stream,
      (err) => {
        if (err) {
          globalLogger.error(`Error pulling "${image}" image:`, err);
          reject(err);
        } else {
          globalLogger.info(`Successfully pulled "${image}" image`);
          resolve(null);
        }
      },
      (output) => {
        logger.info('docker output:', output);
      },
    );
  });
}

async function initFiles(context: Context) {
  const {
    logger,
    s3,
    job: { jobId, s3Bucket, s3RootKey, entrypoint },
  } = context;

  logger.info('Setting up temp file');
  const jobArchiveFile = await tmp.file();

  try {
    logger.info('Setting up temp dir');
    const jobDirectory = await tmp.dir({
      prefix: `job_${jobId}_`,
      unsafeCleanup: true,
    });

    logger.info('Loading job files');
    const object = await s3.getObject({
      Bucket: s3Bucket,
      Key: `${s3RootKey}/job.tar.gz`,
    });
    await pipeline(object.Body as Readable, fs.createWriteStream(jobArchiveFile.path));

    logger.info('Unzipping files');
    await execa('tar', ['-xf', jobArchiveFile.path, '-C', jobDirectory.path]);

    logger.info('Making entrypoint executable');
    await execa('chmod', ['+x', path.join(jobDirectory.path, entrypoint.slice(6))]).catch(() => {
      logger.error('Could not make file executable; continuing execution anyways');
    });

    return jobDirectory;
  } finally {
    await jobArchiveFile.cleanup();
  }
}

async function runJob(
  context: Context,
  receivedTime: Date,
  tempDir: string,
): Promise<GradingResults> {
  const {
    docker,
    logger,
    job: { jobId, image, entrypoint, timeout, enableNetworking, environment },
  } = context;

  // Even if instructors specify a really short timeout for the execution of
  // the grading job, there's a certain amount of overhead associated with
  // running the job (pulling an image, uploading results, etc.). We add a
  // fixed amount of time to the instructor-specified timeout to account for
  // this.
  const jobTimeout = timeout + config.timeoutOverhead;

  const results: GradingResults = {
    job_id: jobId,
    received_time: receivedTime,
  };

  logger.info('Launching Docker container to run grading job');

  const repository = new DockerName(image);
  if (config.cacheImageRegistry) {
    repository.setRegistry(config.cacheImageRegistry);
  }
  const runImage = repository.getCombined();
  logger.info(`Run image: ${runImage}`);

  const timeoutDeferredPromise = deferredPromise<never>();
  const jobTimeoutId = setTimeout(() => {
    healthCheck.flagUnhealthy('Job timeout exceeded; Docker presumed dead.');
    timeoutDeferredPromise.reject(new Error(`Job timeout of ${jobTimeout}s exceeded.`));
  }, jobTimeout * 1000);

  const task = (async () => {
    const container = await docker.createContainer({
      Image: runImage,
      // Convert {key: 'value'} to ['key=value'] and {key: null} to ['key'] for Docker API
      Env: Object.entries(environment).map(([k, v]) => (v === null ? k : `${k}=${v}`)),
      AttachStdout: true,
      AttachStderr: true,
      Tty: true,
      NetworkDisabled: !enableNetworking,
      HostConfig: {
        Binds: [`${tempDir}:/grade`],
        Memory: config.graderDockerMemory,
        MemorySwap: config.graderDockerMemorySwap,
        KernelMemory: config.graderDockerKernelMemory,
        DiskQuota: config.graderDockerDiskQuota,
        IpcMode: 'private',
        CpuPeriod: config.graderDockerCpuPeriod,
        CpuQuota: config.graderDockerCpuQuota,
        PidsLimit: config.graderDockerPidsLimit,
        Ulimits: [
          {
            // Disable core dumps, which can get very large and bloat our storage.
            Name: 'core',
            Soft: 0,
            Hard: 0,
          },
        ],
      },
      Entrypoint: entrypoint.split(' '),
    });

    const stream = await container.attach({
      stream: true,
      stdout: true,
      stderr: true,
    });
    const out = byline(stream);
    out.on('data', (line) => {
      logger.info(`container> ${line.toString('utf8')}`);
    });

    await container.start();
    logger.info('Container started!');

    results.start_time = await timeReporter.reportStartTime(jobId);

    const timeoutId = setTimeout(() => {
      results.timedOut = true;
      container.kill().catch((err) => {
        globalLogger.error('Error killing container', err);
      });
    }, timeout * 1000);

    logger.info('Waiting for container to complete');
    try {
      await container.wait();
    } finally {
      clearTimeout(timeoutId);
    }

    results.end_time = await timeReporter.reportEndTime(jobId);

    const data = await container.inspect();
    if (results.timedOut) {
      logger.info('Container timed out');
    } else {
      logger.info(`Container exited with exit code ${data.State.ExitCode}`);
    }
    results.succeeded = !results.timedOut && data.State.ExitCode === 0;

    await container.remove({
      // Remove any volumes associated with this container
      v: true,
    });

    // We made it through the Docker danger zone!
    clearTimeout(jobTimeoutId ?? undefined);
    logger.info('Reading course results');
    // Now that the job has completed, let's extract the results
    // First up: results.json
    if (results.succeeded) {
      await fs.readFile(path.join(tempDir, 'results', 'results.json')).then(
        (data) => {
          if (Buffer.byteLength(data) > 1024 * 1024) {
            // Cap output at 1MB
            results.succeeded = false;
            results.message =
              'The grading results were larger than 1MB. ' +
              'If the problem persists, please contact course staff or a proctor.';
            return;
          }

          try {
            const parsedResults = JSON.parse(data.toString());
            results.results = sanitizeObject(parsedResults);
            results.succeeded = true;
          } catch (e) {
            logger.error('Could not parse results.json:', e);
            results.succeeded = false;
            results.message = 'Could not parse the grading results.';
          }
        },
        (err) => {
          logger.error('Could not read results.json', err);
          results.succeeded = false;
          results.message = 'Could not read grading results.';
        },
      );
    } else {
      if (results.timedOut) {
        results.message = `Your grading job did not complete within the time limit of ${timeout} seconds.\nPlease fix your code before submitting again.`;
      }
      results.results = null;
    }
  })()
    .catch((err) => {
      logger.error('runJob error', err);

      results.succeeded = false;
      results.message = err.toString();
    })
    .then(() => {
      // It's possible that we get here with an error prior to the global job timeout exceeding.
      // If that happens, Docker is still alive, but it just errored. We'll cancel
      // the timeout here if needed.
      clearTimeout(jobTimeoutId);

      return results;
    });

  return await Promise.race([task, timeoutDeferredPromise.promise]);
}

async function uploadResults(context: Context, results: GradingResults) {
  const {
    logger,
    s3,
    job: { jobId, s3Bucket, s3RootKey },
  } = context;

  // Now we can send the results back to S3
  logger.info(`Uploading results.json to S3 bucket ${s3Bucket}/${s3RootKey}`);
  await new Upload({
    client: s3,
    params: {
      Bucket: s3Bucket,
      Key: `${s3RootKey}/results.json`,
      Body: Buffer.from(JSON.stringify(results, null, 2)),
    },
  }).done();

  // Send the results back to PrairieLearn now; the archive will
  // be uploaded later
  logger.info('Sending results to PrairieLearn with results');
  const messageBody = {
    jobId,
    event: 'grading_result',
    // The SQS max message size is 256KB; if our results payload is
    // larger than 250KB, we won't send results via this and will
    // instead rely on PL fetching them via S3.
    data: JSON.stringify(results).length <= 250 * 1024 ? results : undefined,
  };

  if (!config.resultsQueueUrl) {
    throw new Error('resultsQueueUrl is not defined');
  }

  const sqs = new SQSClient(makeAwsClientConfig());
  await sqs.send(
    new SendMessageCommand({
      QueueUrl: config.resultsQueueUrl,
      MessageBody: JSON.stringify(messageBody),
    }),
  );
}

async function uploadArchive(context: Context, tempDir: string) {
  const {
    logger,
    s3,
    job: { s3Bucket, s3RootKey },
  } = context;

  // Now we can upload the archive of the /grade directory
  logger.info('Creating temp file for archive');
  const archiveFile = await tmp.file();

  try {
    logger.info('Building archive');
    await execa('tar', ['-zcf', archiveFile.path, tempDir]);

    logger.info(`Uploading archive to s3 bucket ${s3Bucket}/${s3RootKey}`);
    await new Upload({
      client: s3,
      params: {
        Bucket: s3Bucket,
        Key: `${s3RootKey}/archive.tar.gz`,
        Body: fs.createReadStream(archiveFile.path),
      },
    }).done();
  } finally {
    await archiveFile.cleanup();
  }
}

async function uploadLogs(context: Context) {
  const {
    logger,
    s3,
    job: { s3Bucket, s3RootKey },
  } = context;

  // Upload all logs to S3.
  await new Upload({
    client: s3,
    params: {
      Bucket: s3Bucket,
      Key: `${s3RootKey}/output.log`,
      Body: logger.getBuffer(),
    },
  }).done();
}
