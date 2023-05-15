// @ts-check
const ERR = require('async-stacktrace');
const async = require('async');
const EventEmitter = require('events');
const fs = require('fs-extra');
const tar = require('tar');
const _ = require('lodash');
const AWS = require('aws-sdk');
const PassThroughStream = require('stream').PassThrough;
const { SQSClient, GetQueueUrlCommand, SendMessageCommand } = require('@aws-sdk/client-sqs');

const { config: globalConfig } = require('./config');
const externalGraderCommon = require('./externalGraderCommon');
const { logger } = require('@prairielearn/logger');
const sqldb = require('@prairielearn/postgres');

const sql = sqldb.loadSqlEquiv(__filename);

let QUEUE_URL = null;

class Grader {
  handleGradingRequest(grading_job, submission, variant, question, course, configOverrides) {
    const config = _.cloneDeep(globalConfig);
    _.assign(config, configOverrides);

    const emitter = new EventEmitter();

    const dir = externalGraderCommon.getJobDirectory(grading_job.id);
    const s3RootKey = getS3RootKey(grading_job.id);

    async.series(
      [
        (callback) => {
          externalGraderCommon.buildDirectory(dir, submission, variant, question, course, callback);
        },
        (callback) => {
          // Now that we've built up our directory, let's zip it up and send
          // it off to S3
          let tarball = tar.create(
            {
              gzip: true,
              cwd: dir,
            },
            ['.']
          );

          const passthrough = new PassThroughStream();
          tarball.pipe(passthrough);

          const params = {
            Bucket: config.externalGradingS3Bucket,
            Key: `${s3RootKey}/job.tar.gz`,
            Body: passthrough,
          };

          const s3 = new AWS.S3(config.awsServiceGlobalOptions);
          s3.upload(params, (err) => {
            if (ERR(err, callback)) return;
            callback(null);
          });
        },
        (callback) => {
          // Store S3 info for this job
          const params = {
            grading_job_id: grading_job.id,
            s3_bucket: config.externalGradingS3Bucket,
            s3_root_key: s3RootKey,
          };
          sqldb.query(sql.update_s3_info, params, (err) => {
            if (ERR(err, callback)) return;
            callback(null);
          });
        },
        async () => sendJobToQueue(grading_job.id, question, config),
      ],
      (err) => {
        fs.remove(dir);
        if (err) {
          emitter.emit('error', err);
        } else {
          emitter.emit('submit');
        }
      }
    );

    return emitter;
  }
}

function getS3RootKey(jobId) {
  return `job_${jobId}`;
}

async function sendJobToQueue(jobId, question, config) {
  const sqs = new SQSClient({
    region: config.awsRegion,
    ...config.awsServiceGlobalOptions,
  });

  await async.series([
    async () => {
      if (QUEUE_URL) return;

      const data = await sqs.send(
        new GetQueueUrlCommand({
          QueueName: config.externalGradingJobsQueueName,
        })
      );
      QUEUE_URL = data.QueueUrl;
    },
    async () => {
      const messageBody = {
        jobId: jobId,
        image: question.external_grading_image,
        entrypoint: question.external_grading_entrypoint,
        s3Bucket: config.externalGradingS3Bucket,
        s3RootKey: getS3RootKey(jobId),
        timeout: question.external_grading_timeout || config.externalGradingDefaultTimeout,
        enableNetworking: question.external_grading_enable_networking || false,
        environment: question.external_grading_environment || {},
      };
      await sqs.send(
        new SendMessageCommand({
          QueueUrl: QUEUE_URL,
          MessageBody: JSON.stringify(messageBody),
        })
      );
      logger.verbose('Queued external grading job', {
        grading_job_id: jobId,
        queueName: config.externalGradingJobsQueueName,
      });
    },
  ]);
}

module.exports = Grader;
