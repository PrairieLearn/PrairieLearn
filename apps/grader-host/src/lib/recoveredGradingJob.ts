import { NoSuchKey, NotFound, S3 } from '@aws-sdk/client-s3';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { z } from 'zod';

import {
  PostgresPool,
  type PostgresPoolConfig,
  loadSqlEquiv,
  queryOptionalScalar,
} from '@prairielearn/postgres';
import * as Sentry from '@prairielearn/sentry';

import { makeAwsClientConfig, makeS3ClientConfig } from './aws.js';
import { config } from './config.js';
import logger from './logger.js';
import type { GradingJobMessage } from './receiveFromQueue.js';

const sql = loadSqlEquiv(import.meta.url);
// Grading reports timestamps through the default pool while this pool holds the lock.
const lockPool = new PostgresPool();

export async function initRecoveredGradingJobLocks(
  pgConfig: PostgresPoolConfig,
  idleErrorHandler: Parameters<PostgresPool['initAsync']>[1],
) {
  await lockPool.initAsync({ ...pgConfig, max: config.maxConcurrentJobs }, idleErrorHandler);
}

export async function closeRecoveredGradingJobLocks() {
  await lockPool.closeAsync();
}

export async function handleRecoveredGradingJob(
  job: GradingJobMessage,
  handleJob: (job: GradingJobMessage) => Promise<void>,
) {
  await lockPool.runInTransactionAsync(async () => {
    // Keep the SQS receipt alive while waiting so another delivery cannot restart an active job.
    await lockPool.execute(sql.lock_recovered_grading_job, { grading_job_id: job.jobId });
    const keepAlive = setInterval(() => {
      lockPool.execute(sql.keep_lock_alive).catch((err) => {
        logger.error('Error keeping recovered grading job lock alive', err);
        Sentry.captureException(err);
      });
    }, 60_000);
    keepAlive.unref();

    try {
      const finished = await queryOptionalScalar(
        sql.is_grading_job_finished,
        { grading_job_id: job.jobId },
        z.boolean(),
      );
      if (finished == null || finished) return;

      const s3 = new S3(makeS3ClientConfig());
      try {
        await s3.headObject({
          Bucket: job.s3Bucket,
          Key: `${job.s3RootKey}/results.json`,
        });
      } catch (err) {
        if (!(err instanceof NotFound || err instanceof NoSuchKey)) throw err;
        await handleJob(job);
        return;
      }

      // The result is durable even if its original notification was interrupted.
      if (!config.resultsQueueUrl) throw new Error('resultsQueueUrl is not defined');
      const sqs = new SQSClient(makeAwsClientConfig());
      await sqs.send(
        new SendMessageCommand({
          QueueUrl: config.resultsQueueUrl,
          MessageBody: JSON.stringify({ jobId: job.jobId, event: 'grading_result' }),
        }),
      );
    } finally {
      clearInterval(keepAlive);
    }
  });
}
