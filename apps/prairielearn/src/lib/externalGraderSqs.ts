import { EventEmitter } from 'events';
import { PassThrough } from 'stream';

import { S3 } from '@aws-sdk/client-s3';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { Upload } from '@aws-sdk/lib-storage';
import fs from 'fs-extra';
import * as tar from 'tar';

import { logger } from '@prairielearn/logger';
import * as sqldb from '@prairielearn/postgres';
import * as Sentry from '@prairielearn/sentry';

import { makeAwsClientConfig, makeS3ClientConfig } from './aws.js';
import { type Config, config as globalConfig } from './config.js';
import {
  type Course,
  type GradingJob,
  type Question,
  type Submission,
  type Variant,
} from './db-types.js';
import {
  ExternalGradingPreparationError,
  type Grader,
  type GradingRequestErrorContext,
  buildDirectory,
  getJobDirectory,
} from './externalGraderCommon.js';
import { getQueueUrl } from './sqs.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

let QUEUE_URL: string | undefined = undefined;

export class ExternalGraderSqs implements Grader {
  handleGradingRequest(
    grading_job: GradingJob,
    submission: Submission,
    variant: Variant,
    question: Question,
    course: Course,
    configOverrides?: Partial<Config>,
  ) {
    const config = structuredClone(globalConfig);
    Object.assign(config, configOverrides);

    const emitter = new EventEmitter();

    const dir = getJobDirectory(grading_job.id);
    const s3RootKey = grading_job.s3_root_key ?? getS3RootKey(grading_job.id);
    const s3Bucket = grading_job.s3_bucket ?? config.externalGradingS3Bucket;
    const prepared = grading_job.s3_bucket !== null && grading_job.s3_root_key !== null;
    const recovered = submission.recovered_from_user_id !== null;

    void (async () => {
      // Let the caller attach listeners before preparation can emit an error.
      await Promise.resolve();
      let stage: GradingRequestErrorContext['stage'] = 'preparation';
      try {
        const s3 = new S3(makeS3ClientConfig());
        let messageBody: string;
        if (prepared && recovered) {
          const request = await s3.getObject({
            Bucket: s3Bucket,
            Key: `${s3RootKey}/request.json`,
          });
          if (!request.Body) throw new Error('Prepared external grading request has no body');
          messageBody = await request.Body.transformToString();
        } else {
          messageBody = JSON.stringify({
            jobId: grading_job.id,
            image: question.external_grading_image,
            entrypoint: question.external_grading_entrypoint,
            s3Bucket,
            s3RootKey,
            ...(recovered ? { recovered: true } : {}),
            timeout: Math.min(
              question.external_grading_timeout ?? config.externalGradingDefaultTimeout,
              config.externalGradingMaximumTimeout,
            ),
            enableNetworking: question.external_grading_enable_networking || false,
            environment: question.external_grading_environment,
          });
        }

        // A recovered dispatch reuses its committed payload after a process interruption.
        if (!prepared) {
          try {
            await buildDirectory(dir, submission, variant, question, course);

            // Now that we've built up our directory, let's zip it up and send
            // it off to S3
            const tarball = tar.create({ gzip: true, cwd: dir }, ['.']);

            const passthrough = new PassThrough();
            tarball.pipe(passthrough);

            const params = {
              Bucket: s3Bucket,
              Key: `${s3RootKey}/job.tar.gz`,
              Body: passthrough,
            };

            await new Upload({ client: s3, params }).done();

            // Keep the archive and its worker settings together across course syncs.
            if (recovered) {
              await s3.putObject({
                Bucket: s3Bucket,
                Key: `${s3RootKey}/request.json`,
                Body: messageBody,
                ContentType: 'application/json',
              });
            }

            // Store S3 info for this job
            await sqldb.execute(sql.update_s3_info, {
              grading_job_id: grading_job.id,
              s3_bucket: s3Bucket,
              s3_root_key: s3RootKey,
            });
          } finally {
            await fs.remove(dir).catch((err) => {
              logger.error('Error removing directory', err);
              Sentry.captureException(err);
            });
          }
        }

        stage = 'publication';
        await sendJobToQueue({
          jobId: grading_job.id,
          config,
          messageBody,
        });
        emitter.emit('submit');
      } catch (err) {
        const context: GradingRequestErrorContext =
          stage === 'publication'
            ? { stage, retryable: true }
            : { stage, retryable: !(err instanceof ExternalGradingPreparationError) };
        emitter.emit('error', err, context);
      }
    })();

    return emitter;
  }
}

function getS3RootKey(jobId: string) {
  return `job_${jobId}`;
}

async function sendJobToQueue({
  jobId,
  config,
  messageBody,
}: {
  jobId: string;
  config: Config;
  messageBody: string;
}) {
  const sqs = new SQSClient(makeAwsClientConfig());

  if (!QUEUE_URL) {
    QUEUE_URL = await getQueueUrl(sqs, config.externalGradingJobsQueueName);
  }

  await sqs.send(
    new SendMessageCommand({
      QueueUrl: QUEUE_URL,
      MessageBody: messageBody,
    }),
  );
  logger.verbose('Queued external grading job', {
    grading_job_id: jobId,
    queueName: config.externalGradingJobsQueueName,
  });
}
