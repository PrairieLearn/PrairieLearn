const util = require('util');
const ERR = require('async-stacktrace');
const fs = require('fs-extra');
const async = require('async');
const tmp = require('tmp');
const Docker = require('dockerode');
const { S3 } = require('@aws-sdk/client-s3');
const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');
const { ECRClient } = require('@aws-sdk/client-ecr');
const { Upload } = require('@aws-sdk/lib-storage');
const { exec } = require('child_process');
const path = require('path');
const byline = require('byline');
const { pipeline } = require('node:stream/promises');
const Sentry = require('@prairielearn/sentry');
const sqldb = require('@prairielearn/postgres');
const { sanitizeObject } = require('@prairielearn/sanitize');
const { DockerName, setupDockerAuth } = require('@prairielearn/docker-utils');

const globalLogger = require('./lib/logger');
const { makeJobLogger } = require('./lib/jobLogger');
const { config, loadConfig } = require('./lib/config');
const healthCheck = require('./lib/healthCheck');
const lifecycle = require('./lib/lifecycle');
const pullImages = require('./lib/pullImages');
const receiveFromQueue = require('./lib/receiveFromQueue');
const timeReporter = require('./lib/timeReporter');
const load = require('./lib/load');
const { makeAwsClientConfig, makeS3ClientConfig } = require('./lib/aws');

const sql = sqldb.loadSqlEquiv(__filename);

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
        password: config.postgresqlPassword,
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
    (callback) => {
      if (!config.useHealthCheck) return callback(null);
      healthCheck.init((err) => {
        if (ERR(err, callback)) return;
        callback(null);
      });
    },
    (callback) => {
      if (!config.useImagePreloading) return callback(null);
      pullImages((err) => {
        if (ERR(err, callback)) return;
        callback(null);
      });
    },
    async () => {
      await lifecycle.inService();
    },
    () => {
      globalLogger.info('Initialization complete; beginning to process jobs');
      const sqs = new SQSClient(makeAwsClientConfig());
      for (let i = 0; i < config.maxConcurrentJobs; i++) {
        async.forever((next) => {
          if (!healthCheck.isHealthy() || processTerminating) return;
          receiveFromQueue(
            sqs,
            config.jobsQueueUrl,
            (job, done) => {
              globalLogger.info(`received ${job.jobId} from queue`);

              // Ensure that this job wasn't canceled in the time since job submission.
              isJobCanceled(job, (err, canceled) => {
                if (ERR(err, done)) return;

                if (canceled) {
                  globalLogger.info(`Job ${job.jobId} was canceled; skipping job`);
                  done();
                  return;
                }

                handleJob(job, (err) => {
                  globalLogger.info(`handleJob(${job.jobId}) completed with err=${err}`);
                  if (ERR(err, done)) return;
                  globalLogger.info(`handleJob(${job.jobId}) succeeded`);
                  done();
                });
              });
            },
            (err) => {
              if (ERR(err, (err) => globalLogger.error('receive error:', err)));
              globalLogger.info('Completed full request cycle');
              next();
            },
          );
        });
      }
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

function isJobCanceled(job, callback) {
  sqldb.queryOneRow(
    sql.check_job_cancellation,
    {
      grading_job_id: job.jobId,
    },
    (err, result) => {
      if (ERR(err, callback)) return;
      callback(null, result.rows[0].canceled);
    },
  );
}

function handleJob(job, done) {
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

  async.auto(
    {
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
          results.initFiles.tempDirCleanup();
          logger.info('Successfully removed temporary directories');
          callback(null);
        },
      ],
    },
    (err) => {
      logger.info(`Reducing load average, err=${err}`);
      load.endJob();
      logger.info('Successfully reduced load average');
      if (ERR(err, done)) return;
      logger.info('Successfully completed handleJob()');
      done(null);
    },
  );
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

function initDocker(info, callback) {
  const {
    context: {
      logger,
      docker,
      job: { image },
    },
  } = info;
  let dockerAuth = {};

  async.series(
    [
      (callback) => {
        logger.info('Pinging docker');
        docker.ping((err) => {
          if (ERR(err, callback)) return;
          callback(null);
        });
      },
      async () => {
        if (config.cacheImageRegistry) {
          logger.info('Authenticating to docker');
          const ecr = new ECRClient(makeAwsClientConfig());
          dockerAuth = await setupDockerAuth(ecr);
        }
      },
      async () => {
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
                resolve();
              }
            },
            (output) => {
              logger.info('docker output:', output);
            },
          );
        });
      },
    ],
    (err) => {
      if (ERR(err, callback)) return;
      callback(null);
    },
  );
}

function initFiles(info, callback) {
  const {
    context: {
      logger,
      s3,
      job: { jobId, s3Bucket, s3RootKey, entrypoint },
    },
  } = info;

  let jobArchiveFile, jobArchiveFileCleanup;
  const files = {};

  async.series(
    [
      (callback) => {
        logger.info('Setting up temp file');
        tmp.file((err, file, fd, cleanup) => {
          if (ERR(err, callback)) return;
          jobArchiveFile = file;
          jobArchiveFileCleanup = cleanup;
          callback(null);
        });
      },
      (callback) => {
        logger.info('Setting up temp dir');
        tmp.dir(
          {
            prefix: `job_${jobId}_`,
            unsafeCleanup: true,
          },
          (err, dir, cleanup) => {
            if (ERR(err, callback)) return;
            files.tempDir = dir;
            files.tempDirCleanup = cleanup;
            callback(null);
          },
        );
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
      (callback) => {
        logger.info('Unzipping files');
        exec(`tar -xf ${jobArchiveFile} -C ${files.tempDir}`, (err) => {
          if (ERR(err, callback)) return;
          jobArchiveFileCleanup();
          callback(null);
        });
      },
      (callback) => {
        logger.info('Making entrypoint executable');
        exec(`chmod +x ${path.join(files.tempDir, entrypoint.slice(6))}`, (err) => {
          if (err) {
            logger.error('Could not make file executable; continuing execution anyways');
          }
          callback(null);
        });
      },
    ],
    (err) => {
      if (ERR(err, callback)) return;
      callback(null, files);
    },
  );
}

function runJob(info, callback) {
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

  let jobFailed = false;
  let jobTimeoutId = setTimeout(() => {
    jobFailed = true;
    healthCheck.flagUnhealthy('Job timeout exceeded; Docker presumed dead.');
    return callback(new Error(`Job timeout of ${jobTimeout}s exceeded.`));
  }, jobTimeout * 1000);

  logger.info('Launching Docker container to run grading job');

  var repository = new DockerName(image);
  if (config.cacheImageRegistry) {
    repository.setRegistry(config.cacheImageRegistry);
  }
  const runImage = repository.getCombined();
  logger.info(`Run image: ${runImage}`);

  async.waterfall(
    [
      (callback) => {
        docker.createContainer(
          {
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
          },
          (err, container) => {
            if (ERR(err, callback)) return;
            callback(null, container);
          },
        );
      },
      (container, callback) => {
        container.attach(
          {
            stream: true,
            stdout: true,
            stderr: true,
          },
          (err, stream) => {
            if (ERR(err, callback)) return;
            const out = byline(stream);
            out.on('data', (line) => {
              logger.info(`container> ${line.toString('utf8')}`);
            });
            callback(null, container);
          },
        );
      },
      (container, callback) => {
        container.start((err) => {
          if (ERR(err, callback)) return;
          logger.info('Container started!');
          callback(null, container);
        });
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
      (container, callback) => {
        container.inspect((err, data) => {
          if (ERR(err, callback)) return;
          if (results.timedOut) {
            logger.info('Container timed out');
          } else {
            logger.info(`Container exited with exit code ${data.State.ExitCode}`);
          }
          results.succeeded = !results.timedOut && data.State.ExitCode === 0;
          callback(null, container);
        });
      },
      (container, callback) => {
        container.remove(
          {
            // Remove any volumes associated with this container
            v: true,
          },
          (err) => {
            if (ERR(err, callback)) return;
            callback(null);
          },
        );
      },
      (callback) => {
        // We made it through the Docker danger zone!
        clearTimeout(jobTimeoutId);
        jobTimeoutId = null;
        logger.info('Reading course results');
        // Now that the job has completed, let's extract the results
        // First up: results.json
        if (results.succeeded) {
          fs.readFile(path.join(tempDir, 'results', 'results.json'), (err, data) => {
            if (err) {
              logger.error('Could not read results.json');
              results.succeeded = false;
              results.message = 'Could not read grading results.';
              callback(null);
            } else {
              if (Buffer.byteLength(data) > 1024 * 1024) {
                // Cap output at 1MB
                results.succeeded = false;
                results.message =
                  'The grading results were larger than 1MB. ' +
                  'If the problem persists, please contact course staff or a proctor.';
                return callback(null);
              }

              try {
                const parsedResults = JSON.parse(data);
                results.results = sanitizeObject(parsedResults);
                results.succeeded = true;
              } catch (e) {
                logger.error('Could not parse results.json:', e);
                results.succeeded = false;
                results.message = 'Could not parse the grading results.';
              }

              callback(null);
            }
          });
        } else {
          if (results.timedOut) {
            results.message = `Your grading job did not complete within the time limit of ${timeout} seconds.\nPlease fix your code before submitting again.`;
          }
          results.results = null;
          callback(null);
        }
      },
    ],
    (err) => {
      if (ERR(err, (err) => logger.error('runJob error:', err)));

      // It's possible that we get here with an error prior to the global job timeout exceeding.
      // If that happens, Docker is still alive, but it just errored. We'll cancel
      // the timeout here if needed.
      if (jobTimeoutId != null) {
        clearTimeout(jobTimeoutId);
      }

      // If we somehow eventually get here after exceeding the global timeout,
      // we should avoid calling the callback again
      if (jobFailed) {
        return;
      }

      results.job_id = jobId;
      results.received_time = receivedTime;

      if (err) {
        results.succeeded = false;
        results.message = err.toString();
        return callback(null, results);
      } else {
        return callback(null, results);
      }
    },
  );
}

function uploadResults(info, callback) {
  const {
    context: {
      logger,
      s3,
      job: { jobId, s3Bucket, s3RootKey },
    },
    runJob: results,
  } = info;

  async.series(
    [
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

        const sqs = new SQSClient(makeAwsClientConfig());
        await sqs.send(
          new SendMessageCommand({
            QueueUrl: config.resultsQueueUrl,
            MessageBody: JSON.stringify(messageBody),
          }),
        );
      },
    ],
    (err) => {
      if (ERR(err, callback)) return;
      callback(null);
    },
  );
}

function uploadArchive(results, callback) {
  const {
    context: {
      logger,
      s3,
      job: { s3Bucket, s3RootKey },
    },
    initFiles: { tempDir },
  } = results;

  let tempArchive, tempArchiveCleanup;
  async.series(
    [
      // Now we can upload the archive of the /grade directory
      (callback) => {
        logger.info('Creating temp file for archive');
        tmp.file((err, file, fd, cleanup) => {
          if (ERR(err, callback)) return;
          tempArchive = file;
          tempArchiveCleanup = cleanup;
          callback(null);
        });
      },
      (callback) => {
        logger.info('Building archive');
        exec(`tar -zcf ${tempArchive} ${tempDir}`, (err) => {
          if (ERR(err, callback)) return;
          callback(null);
        });
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
    ],
    (err) => {
      if (ERR(err, callback)) return;
      tempArchiveCleanup && tempArchiveCleanup();
      callback(null);
    },
  );
}
