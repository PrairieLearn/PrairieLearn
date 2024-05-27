// @ts-check
import { EventEmitter } from 'events';
import { PassThrough } from 'stream';

import { S3 } from '@aws-sdk/client-s3';
import { SQSClient, GetQueueUrlCommand, SendMessageCommand } from '@aws-sdk/client-sqs';
import { Upload } from '@aws-sdk/lib-storage';
import * as async from 'async';
import fs from 'fs-extra';
import _ from 'lodash';
import * as tar from 'tar';

import { logger } from '@prairielearn/logger';
import * as sqldb from '@prairielearn/postgres';

import { makeAwsClientConfig, makeS3ClientConfig } from './aws.js';
import { config as globalConfig } from './config.js';
import { getJobDirectory, buildDirectory } from './externalGraderCommon.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

let QUEUE_URL = null;

export class ExternalGraderSqs {
  handleGradingRequest(grading_job, submission, variant, question, course, configOverrides) {
    const config = _.cloneDeep(globalConfig);
    _.assign(config, configOverrides);

    const emitter = new EventEmitter();

    const dir = getJobDirectory(grading_job.id);
    const s3RootKey = getS3RootKey(grading_job.id);

    async.series(
      [
        async () => {
          await buildDirectory(dir, submission, variant, question, course);

          // Now that we've built up our directory, let's zip it up and send
          // it off to S3
          let tarball = tar.create({ gzip: true, cwd: dir }, ['.']);

          const passthrough = new PassThrough();
          tarball.pipe(passthrough);

          const params = {
            Bucket: config.externalGradingS3Bucket,
            Key: `${s3RootKey}/job.tar.gz`,
            Body: passthrough,
          };

          const s3 = new S3(makeS3ClientConfig());
          await new Upload({ client: s3, params }).done();

          // Store S3 info for this job
          await sqldb.queryAsync(sql.update_s3_info, {
            grading_job_id: grading_job.id,
            s3_bucket: config.externalGradingS3Bucket,
            s3_root_key: s3RootKey,
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
      },
    );

    return emitter;
  }
}

function getS3RootKey(jobId) {
  return `job_${jobId}`;
}

async function sendJobToQueue(jobId, question, config) {
  const sqs = new SQSClient(makeAwsClientConfig());

  await async.series([
    async () => {
      if (QUEUE_URL) return;

      const data = await sqs.send(
        new GetQueueUrlCommand({
          QueueName: config.externalGradingJobsQueueName,
        }),
      );
      QUEUE_URL = data.QueueUrl;
    },
    async () => {
      const messageBody = {
        jobId,
        image: question.external_grading_image,
        entrypoint: question.external_grading_entrypoint,
        s3Bucket: config.externalGradingS3Bucket,
        s3RootKey: getS3RootKey(jobId),
        timeout: Math.min(
          question.external_grading_timeout ?? config.externalGradingDefaultTimeout,
          config.externalGradingMaximumTimeout,
        ),
        enableNetworking: question.external_grading_enable_networking || false,
        environment: question.external_grading_environment || {},
      };
      await sqs.send(
        new SendMessageCommand({
          QueueUrl: QUEUE_URL,
          MessageBody: JSON.stringify(messageBody),
        }),
      );
      logger.verbose('Queued external grading job', {
        grading_job_id: jobId,
        queueName: config.externalGradingJobsQueueName,
      });
    },
  ]);
}
