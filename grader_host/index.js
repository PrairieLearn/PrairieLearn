const util = require('util');
const ERR = require('async-stacktrace');
const fs = require('fs-extra');
const async = require('async');
const tmp = require('tmp');
const Docker = require('dockerode');
const AWS = require('aws-sdk');
const { exec } = require('child_process');
const path = require('path');
const byline = require('byline');
const sqldb = require('../prairielib/lib/sql-db');
const sanitizeObject = require('../prairielib/lib/util').sanitizeObject;

const globalLogger = require('./lib/logger');
const jobLogger = require('./lib/jobLogger');
const configManager = require('./lib/config');
const config = require('./lib/config').config;
const healthCheck = require('./lib/healthCheck');
const lifecycle = require('./lib/lifecycle');
const pullImages = require('./lib/pullImages');
const receiveFromQueue = require('./lib/receiveFromQueue');
const timeReporter = require('./lib/timeReporter');
const dockerUtil = require('./lib/dockerUtil');
const load = require('./lib/load');

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
    (callback) => {
      configManager.loadConfig((err) => {
        if (ERR(err, callback)) return;
        globalLogger.info('Config loaded:');
        globalLogger.info(JSON.stringify(config, null, 2));
        callback(null);
      });
    },
    async () => {
      await lifecycle.init();
    },
    (callback) => {
      if (!config.useDatabase) return callback(null);
      var pgConfig = {
        host: config.postgresqlHost,
        database: config.postgresqlDatabase,
        user: config.postgresqlUser,
        password: config.postgresqlPassword,
        max: 2,
        idleTimeoutMillis: 30000,
      };
      globalLogger.info(
        'Connecting to database ' + pgConfig.user + '@' + pgConfig.host + ':' + pgConfig.database
      );
      var idleErrorHandler = function (err) {
        globalLogger.error('idle client error', err);
      };
      sqldb.init(pgConfig, idleErrorHandler, function (err) {
        if (ERR(err, callback)) return;
        globalLogger.info('Successfully connected to database');
        callback(null);
      });
    },
    (callback) => {
      if (!config.useDatabase || !config.reportLoad) return callback(null);
      load.init(config.maxConcurrentJobs);
      callback(null);
    },
    (callback) => {
      if (!config.useHealthCheck) return callback(null);
      healthCheck.init((err) => {
        if (ERR(err, callback)) return;
        callback(null);
      });
    },
    (callback) => {
      if (!config.useDatabase || !config.useImagePreloading) return callback(null);
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
      const sqs = new AWS.SQS();
      for (let i = 0; i < config.maxConcurrentJobs; i++) {
        async.forever((next) => {
          if (!healthCheck.isHealthy() || processTerminating) return;
          receiveFromQueue(
            sqs,
            config.jobsQueueUrl,
            (job, fail, success) => {
              globalLogger.info(`received ${job.jobId} from queue`);
              handleJob(job, (err) => {
                globalLogger.info(`handleJob(${job.jobId}) completed with err=${err}`);
                if (ERR(err, fail)) return;
                globalLogger.info(`handleJob(${job.jobId}) succeeded`);
                success();
              });
            },
            (err) => {
              if (ERR(err, (err) => globalLogger.error('receive error:', err)));
              globalLogger.info('Completed full request cycle');
              next();
            }
          );
        });
      }
    },
  ],
  (err) => {
    globalLogger.error('Error in main loop:', err);
    util.callbackify(lifecycle.abandonLaunch)((err) => {
      if (err) globalLogger.error('Error in lifecycle.abandon():', err);
      // pause to log errors, then exit
      setTimeout(() => {
        process.exit(1);
      }, 1000);
    });
  }
);

function handleJob(job, done) {
  load.startJob();

  const loggerOptions = {
    bucket: job.s3Bucket,
    rootKey: job.s3RootKey,
  };

  const logger = jobLogger(loggerOptions);
  globalLogger.info(`Logging job ${job.jobId} to S3: ${job.s3Bucket}/${job.s3RootKey}`);

  const info = {
    docker: new Docker(),
    s3: new AWS.S3(),
    logger,
    job,
  };

  logger.info(`Running job ${job.jobId}`);
  logger.info('job details:', job);

  async.auto(
    {
      context: (callback) => context(info, callback),
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
    }
  );
}

function context(info, callback) {
  const {
    job: { jobId },
  } = info;

  timeReporter.reportReceivedTime(jobId, (err, time) => {
    if (ERR(err, callback)) return;
    const context = {
      ...info,
      receivedTime: time,
    };
    callback(null, context);
  });
}

function reportReceived(info, callback) {
  const {
    context: { job, receivedTime, logger },
  } = info;
  logger.info('Sending job acknowledgement to PrairieLearn');

  const sqs = new AWS.SQS();
  const messageBody = {
    jobId: job.jobId,
    event: 'job_received',
    data: {
      receivedTime: receivedTime,
    },
  };
  const params = {
    QueueUrl: config.resultsQueueUrl,
    MessageBody: JSON.stringify(messageBody),
  };
  sqs.sendMessage(params, (err) => {
    // We don't want to fail the job if this notification fails
    if (ERR(err, (err) => logger.error('sendMessage error:', err)));
    callback(null);
  });
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
      (callback) => {
        if (config.cacheImageRegistry) {
          logger.info('Authenticating to docker');
          dockerUtil.setupDockerAuth((err, auth) => {
            if (ERR(err, callback)) return;
            dockerAuth = auth;
            callback(null);
          });
        } else {
          callback(null);
        }
      },
      (callback) => {
        logger.info(`Pulling latest version of "${image}" image`);
        var repository = new dockerUtil.DockerName(image);
        if (config.cacheImageRegistry) {
          repository.registry = config.cacheImageRegistry;
        }
        const params = {
          fromImage: repository.getRegistryRepo(),
          tag: repository.getTag() || 'latest',
        };
        logger.info(`Pulling image: ${JSON.stringify(params)}`);
        docker.createImage(dockerAuth, params, (err, stream) => {
          if (err) {
            logger.warn(
              `Error pulling "${image}" image; attempting to fall back to cached version`
            );
            logger.warn('createImage error:', err);
            return ERR(err, callback);
          }

          docker.modem.followProgress(
            stream,
            (err) => {
              if (ERR(err, callback)) return;
              callback(null);
            },
            (output) => {
              logger.info('docker output:', output);
            }
          );
        });
      },
    ],
    (err) => {
      if (ERR(err, callback)) return;
      callback(null);
    }
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
          }
        );
      },
      (callback) => {
        logger.info('Loading job files');
        const params = {
          Bucket: s3Bucket,
          Key: `${s3RootKey}/job.tar.gz`,
        };
        s3.getObject(params)
          .createReadStream()
          .on('error', (err) => {
            return ERR(err, callback);
          })
          .on('end', () => {
            callback(null);
          })
          .pipe(fs.createWriteStream(jobArchiveFile));
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
    }
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
  let jobTimeout = timeout || 30;
  let globalJobTimeout = jobTimeout * 2;
  let jobEnableNetworking = enableNetworking || false;
  let jobEnvironment = environment || {};

  let jobFailed = false;
  let globalJobTimeoutCleared = false;
  const globalJobTimeoutId = setTimeout(() => {
    jobFailed = true;
    healthCheck.flagUnhealthy('Job timeout exceeded; Docker presumed dead.');
    return callback(new Error(`Job timeout of ${globalJobTimeout}s exceeded.`));
  }, globalJobTimeout * 1000);

  logger.info('Launching Docker container to run grading job');

  var repository = new dockerUtil.DockerName(image);
  if (config.cacheImageRegistry) {
    repository.registry = config.cacheImageRegistry;
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
              Memory: 1 << 30, // 1 GiB
              MemorySwap: 1 << 30, // same as Memory, so no access to swap
              KernelMemory: 1 << 29, // 512 MiB
              DiskQuota: 1 << 30, // 1 GiB
              IpcMode: 'private',
              CpuPeriod: 100000, // microseconds
              CpuQuota: 90000, // portion of the CpuPeriod for this container
              PidsLimit: 1024,
            },
            Entrypoint: entrypoint.split(' '),
          },
          (err, container) => {
            if (ERR(err, callback)) return;
            callback(null, container);
          }
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
          }
        );
      },
      (container, callback) => {
        container.start((err) => {
          if (ERR(err, callback)) return;
          logger.info('Container started!');
          callback(null, container);
        });
      },
      (container, callback) => {
        timeReporter.reportStartTime(jobId, (err, time) => {
          if (ERR(err, callback)) return;
          results.start_time = time;
          callback(null, container);
        });
      },
      (container, callback) => {
        const timeoutId = setTimeout(() => {
          results.timedOut = true;
          container.kill();
        }, jobTimeout * 1000);
        logger.info('Waiting for container to complete');
        container.wait((err) => {
          clearTimeout(timeoutId);
          if (ERR(err, callback)) return;
          callback(null, container);
        });
      },
      (container, callback) => {
        timeReporter.reportEndTime(jobId, (err, time) => {
          if (ERR(err, callback)) return;
          results.end_time = time;
          callback(null, container);
        });
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
          }
        );
      },
      (callback) => {
        // We made it throught the Docker danger zone!
        clearTimeout(globalJobTimeoutId);
        globalJobTimeoutCleared = true;
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
            results.message = `Your grading job did not complete within the time limit of ${timeout} seconds. Please fix your code before submitting again.`;
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
      if (!globalJobTimeoutCleared) {
        clearTimeout(globalJobTimeoutId);
      }

      // If we somehow eventually get here after exceeding the global tieout,
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
    }
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
      (callback) => {
        // Now we can send the results back to S3
        logger.info(`Uploading results.json to S3 bucket ${s3Bucket}/${s3RootKey}`);
        const params = {
          Bucket: s3Bucket,
          Key: `${s3RootKey}/results.json`,
          Body: Buffer.from(JSON.stringify(results, null, '  '), 'binary'),
        };
        s3.putObject(params, (err) => {
          if (ERR(err, callback)) return;
          callback(null);
        });
      },
      (callback) => {
        // Let's send the results back to PrairieLearn now; the archive will
        // be uploaded later
        logger.info('Sending results to PrairieLearn with results');
        const sqs = new AWS.SQS();
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

        const params = {
          QueueUrl: config.resultsQueueUrl,
          MessageBody: JSON.stringify(messageBody),
        };
        sqs.sendMessage(params, (err) => {
          if (ERR(err, callback)) return;
          callback(null);
        });
      },
    ],
    (err) => {
      if (ERR(err, callback)) return;
      callback(null);
    }
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
      (callback) => {
        logger.info(`Uploading archive to s3 bucket ${s3Bucket}/${s3RootKey}`);
        const params = {
          Bucket: s3Bucket,
          Key: `${s3RootKey}/archive.tar.gz`,
          Body: fs.createReadStream(tempArchive),
        };
        s3.upload(params, (err) => {
          if (ERR(err, callback)) return;
          callback(null);
        });
      },
    ],
    (err) => {
      if (ERR(err, callback)) return;
      tempArchiveCleanup && tempArchiveCleanup();
      callback(null);
    }
  );
}
