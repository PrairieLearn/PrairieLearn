// @ts-check
import { pipeline } from 'node:stream/promises';
import * as util from 'node:util';
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
import { sanitizeObject } from '@prairielearn/sanitize';
import * as Sentry from '@prairielearn/sentry';

import { makeAwsClientConfig, makeS3ClientConfig } from './lib/aws.js';
import { config, loadConfig } from './lib/config.js';
import * as healthCheck from './lib/healthCheck.js';
import { makeJobLogger } from './lib/jobLogger.js';
import * as lifecycle from './lib/lifecycle.js';
import * as load from './lib/load.js';
import globalLogger from './lib/logger.js';
import pullImages from './lib/pullImages.js';
import receiveFromQueue from './lib/receiveFromQueue.js';
import * as timeReporter from './lib/timeReporter.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

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

      function worker() {
        // eslint-disable-next-line no-constant-condition
        while (true) {
          if (!healthCheck.isHealthy() || processTerminating) return;

          if (!config.jobsQueueUrl) {
            throw new Error('jobsQueueUrl is not defined');
          }

          receiveFromQueue(sqs, config.jobsQueueUrl, async (job) => {
            globalLogger.info(`received ${job.jobId} from queue`);

            // Ensure that this job wasn't canceled in the time since job submission.
            const canceled = await isJobCanceled(job);

            if (canceled) {
              globalLogger.info(`Job ${job.jobId} was canceled; skipping job`);
              return;
            }

            await handleJob(job).then(
              () => globalLogger.info(`handleJob(${job.jobId}) succeeded`),
              (err) => globalLogger.info(`handleJob(${job.jobId}) errored`, err),
            );
          }).catch((err) => {
            globalLogger.error('receive error:', err);
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
    util.callbackify(lifecycle.abandonLaunch)((err) => {
      if (err) globalLogger.error('Error in lifecycle.abandon():', err);
      // pause to log errors, then exit
      setTimeout(() => {
        process.exit(1);
      }, 1000);
    });
  },
);

async function isJobCanceled(job) {
  const result = await sqldb.queryOneRowAsync(sql.check_job_cancellation, {
    grading_job_id: job.jobId,
  });

  return result.rows[0].canceled;
}

async function handleJob(job) {
  load.startJob();

  const logger = makeJobLogger();
  globalLogger.info(`Logging job ${job.jobId} to S3: ${job.s3Bucket}/${job.s3RootKey}`);

  const info = {
    docker: new Docker(),
    s3: new S3(makeS3ClientConfig({ maxAttempts: 3 })),
    logger,
    job,
  };

  logger.info(`Running job ${job.jobId}`);
  logger.info('job details:', job);

  await async
    .auto({
      context: async () => await context(info),
      reportReceived: ['context', reportReceived],
      initDocker: ['context', initDocker],
      initFiles: ['context', initFiles],
      runJob: ['initDocker', 'initFiles', runJob],
      uploadResults: ['runJob', uploadResults],
      uploadArchive: ['runJob', uploadArchive],
      cleanup: [
        'uploadResults',
        'uploadArchive',
        function (results, callback) {
          logger.info('Removing temporary directories');
          // @ts-expect-error -- Incomplete typing information.
          results.initFiles.tempDirCleanup();
          logger.info('Successfully removed temporary directories');
          callback(null);
        },
      ],
    })
    .finally(() => {
      load.endJob();
    });
}

async function context(info) {
  const {
    job: { jobId },
  } = info;

  const receivedTime = await timeReporter.reportReceivedTime(jobId);
  return {
    ...info,
    receivedTime,
  };
}

async function reportReceived(info) {
  if (!config.resultsQueueUrl) {
    throw new Error('resultsQueueUrl is not defined');
  }

  const {
    context: { job, receivedTime, logger },
  } = info;
  logger.info('Sending job acknowledgement to PrairieLearn');

  const messageBody = {
    jobId: job.jobId,
    event: 'job_received',
    data: {
      receivedTime,
    },
  };
  const sqs = new SQSClient(makeAwsClientConfig());
  try {
    await sqs.send(
      new SendMessageCommand({
        QueueUrl: config.resultsQueueUrl,
        MessageBody: JSON.stringify(messageBody),
      }),
    );
  } catch (err) {
    // We don't want to fail the job if this notification fails
    logger.error('sendMessage error:', err);
    Sentry.captureException(err);
  }
}

async function initDocker(info) {
  const {
    context: {
      logger,
      docker,
      job: { image },
    },
  } = info;
  let dockerAuth = {};

  logger.info('Pinging docker');
  await docker.ping();

  if (config.cacheImageRegistry) {
    logger.info('Authenticating to docker');
    const ecr = new ECRClient(makeAwsClientConfig());
    dockerAuth = await setupDockerAuth(ecr);
  }

  logger.info(`Pulling latest version of "${image}" image`);
  var repository = new DockerName(image);
  if (config.cacheImageRegistry) {
    repository.setRegistry(config.cacheImageRegistry);
  }
  const params = {
    fromImage: repository.getRegistryRepo(),
    tag: repository.getTag() || 'latest',
  };
  logger.info(`Pulling image: ${JSON.stringify(params)}`);

  const stream = await docker.createImage(dockerAuth, params);

  return new Promise((resolve, reject) => {
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

async function initFiles(info) {
  const {
    context: {
      logger,
      s3,
      job: { jobId, s3Bucket, s3RootKey, entrypoint },
    },
  } = info;

  let jobArchiveFile, jobArchiveFileCleanup;
  const files = {};

  await async.series([
    async () => {
      logger.info('Setting up temp file');
      const res = await tmp.file();
      jobArchiveFile = res.path;
      jobArchiveFileCleanup = res.cleanup;
    },
    async () => {
      logger.info('Setting up temp dir');
      const res = await tmp.dir({
        prefix: `job_${jobId}_`,
        unsafeCleanup: true,
      });
      files.tempDir = res.path;
      files.tempDirCleanup = res.cleanup;
    },
    async () => {
      logger.info('Loading job files');
      const params = {
        Bucket: s3Bucket,
        Key: `${s3RootKey}/job.tar.gz`,
      };
      const object = await s3.getObject(params);
      await pipeline(object.Body, fs.createWriteStream(jobArchiveFile));
    },
    async () => {
      logger.info('Unzipping files');
      await execa('tar', ['-xf', jobArchiveFile, '-C', files.tempDir]);
      jobArchiveFileCleanup();
    },
    async () => {
      logger.info('Making entrypoint executable');
      await execa('chmod', ['+x', path.join(files.tempDir, entrypoint.slice(6))]).catch(() => {
        logger.error('Could not make file executable; continuing execution anyways');
      });
    },
  ]);

  return files;
}

async function runJob(info) {
  const {
    context: {
      docker,
      logger,
      receivedTime,
      job: { jobId, image, entrypoint, timeout, enableNetworking, environment },
    },
    initFiles: { tempDir },
  } = info;

  let results = {};
  let runTimeout = timeout || config.defaultTimeout;
  // Even if instructors specify a really short timeout for the execution of
  // the grading job, there's a certain amount of overhead associated with
  // running the job (pulling an image, uploading results, etc.). We add a
  // fixed amount of time to the instructor-specified timeout to account for
  // this.
  let jobTimeout = config.timeoutOverhead + runTimeout;
  let jobEnableNetworking = enableNetworking || false;
  let jobEnvironment = environment || {};

  logger.info('Launching Docker container to run grading job');

  var repository = new DockerName(image);
  if (config.cacheImageRegistry) {
    repository.setRegistry(config.cacheImageRegistry);
  }
  const runImage = repository.getCombined();
  logger.info(`Run image: ${runImage}`);

  /** @type {NodeJS.Timeout | null} */
  let jobTimeoutId;
  const timeoutPromise = new Promise((reject) => {
    jobTimeoutId = setTimeout(() => {
      healthCheck.flagUnhealthy('Job timeout exceeded; Docker presumed dead.');
      reject(new Error(`Job timeout of ${jobTimeout}s exceeded.`));
    }, jobTimeout * 1000);
  });

  const task = async
    .waterfall([
      async () => {
        return await docker.createContainer({
          Image: runImage,
          // Convert {key: 'value'} to ['key=value'] and {key: null} to ['key'] for Docker API
          Env: Object.entries(jobEnvironment).map(([k, v]) => (v === null ? k : `${k}=${v}`)),
          AttachStdout: true,
          AttachStderr: true,
          Tty: true,
          NetworkDisabled: !jobEnableNetworking,
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
      },
      async (container) => {
        const stream = await container.attach({
          stream: true,
          stdout: true,
          stderr: true,
        });
        const out = byline(stream);
        out.on('data', (line) => {
          logger.info(`container> ${line.toString('utf8')}`);
        });
        return container;
      },
      async (container) => {
        await container.start();
        logger.info('Container started!');
        return container;
      },
      async (container) => {
        results.start_time = await timeReporter.reportStartTime(jobId);
        return container;
      },
      async (container) => {
        const timeoutId = setTimeout(() => {
          results.timedOut = true;
          container.kill().catch((err) => {
            globalLogger.error('Error killing container', err);
          });
        }, runTimeout * 1000);

        logger.info('Waiting for container to complete');
        try {
          await container.wait();
        } finally {
          clearTimeout(timeoutId);
        }

        return container;
      },
      async (container) => {
        results.end_time = await timeReporter.reportEndTime(jobId);
        return container;
      },
      async (container) => {
        const data = await container.inspect();
        if (results.timedOut) {
          logger.info('Container timed out');
        } else {
          logger.info(`Container exited with exit code ${data.State.ExitCode}`);
        }
        results.succeeded = !results.timedOut && data.State.ExitCode === 0;
        return container;
      },
      async (container) => {
        await container.remove({
          // Remove any volumes associated with this container
          v: true,
        });
      },
      async () => {
        // We made it through the Docker danger zone!
        clearTimeout(jobTimeoutId ?? undefined);
        jobTimeoutId = null;
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
      },
    ])
    .catch((err) => {
      logger.error('runJob error', err);

      results.succeeded = false;
      results.message = err.toString();
    })
    .then(() => {
      // It's possible that we get here with an error prior to the global job timeout exceeding.
      // If that happens, Docker is still alive, but it just errored. We'll cancel
      // the timeout here if needed.
      if (jobTimeoutId != null) {
        clearTimeout(jobTimeoutId);
      }

      results.job_id = jobId;
      results.received_time = receivedTime;

      return results;
    });

  return await Promise.race([task, timeoutPromise]);
}

async function uploadResults(info) {
  const {
    context: {
      logger,
      s3,
      job: { jobId, s3Bucket, s3RootKey },
    },
    runJob: results,
  } = info;

  await async.series([
    async () => {
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
    },
    async () => {
      // Let's send the results back to PrairieLearn now; the archive will
      // be uploaded later
      logger.info('Sending results to PrairieLearn with results');
      const messageBody = {
        jobId,
        event: 'grading_result',
      };

      // The SQS max message size is 256KB; if our results payload is
      // larger than 250KB, we won't send results via this and will
      // instead rely on PL fetching them via S3.
      if (JSON.stringify(results).length <= 250 * 1024) {
        messageBody.data = results;
      }

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
    },
  ]);
}

async function uploadArchive(results) {
  const {
    context: {
      logger,
      s3,
      job: { s3Bucket, s3RootKey },
    },
    initFiles: { tempDir },
  } = results;

  let tempArchive, tempArchiveCleanup;
  await async
    .series([
      // Now we can upload the archive of the /grade directory
      async () => {
        logger.info('Creating temp file for archive');
        const res = await tmp.file();
        tempArchive = res.path;
        tempArchiveCleanup = res.cleanup;
      },
      async () => {
        logger.info('Building archive');
        await execa('tar', ['-zcf', tempArchive, tempDir]);
      },
      async () => {
        logger.info(`Uploading archive to s3 bucket ${s3Bucket}/${s3RootKey}`);
        await new Upload({
          client: s3,
          params: {
            Bucket: s3Bucket,
            Key: `${s3RootKey}/archive.tar.gz`,
            Body: fs.createReadStream(tempArchive),
          },
        }).done();
      },
      async () => {
        // Upload all logs to S3.
        await new Upload({
          client: s3,
          params: {
            Bucket: s3Bucket,
            Key: `${s3RootKey}/output.log`,
            Body: logger.getBuffer(),
          },
        }).done();
      },
    ])
    .finally(() => {
      tempArchiveCleanup?.();
    });
}
