import { NotFound, S3, S3ServiceException } from '@aws-sdk/client-s3';
import { SQSClient } from '@aws-sdk/client-sqs';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { execute, loadSqlEquiv, makePostgresTestUtils, queryScalar } from '@prairielearn/postgres';
import { withResolvers } from '@prairielearn/utils';

import { config } from './config.js';
import type { GradingJobMessage } from './receiveFromQueue.js';
import {
  closeRecoveredGradingJobLocks,
  handleRecoveredGradingJob,
  initRecoveredGradingJobLocks,
} from './recoveredGradingJob.js';

const sql = loadSqlEquiv(import.meta.url);
const database = makePostgresTestUtils({ database: 'grader_host_recovered_jobs' });
const job: GradingJobMessage = {
  jobId: '1',
  recovered: true,
  image: 'grader',
  entrypoint: null,
  timeout: 60,
  enableNetworking: false,
  environment: {},
  s3Bucket: 'grading',
  s3RootKey: 'job_1',
};

describe('recovered grading job delivery', () => {
  beforeAll(async () => {
    config.maxConcurrentJobs = 2;
    config.awsRegion = 'us-east-2';
    config.resultsQueueUrl = 'https://sqs.example.com/results';
    const pgConfig = await database.createDatabase();
    await initRecoveredGradingJobLocks(pgConfig, (err) => {
      throw err;
    });
    await execute(sql.create_tables);
  });

  beforeEach(async () => {
    await database.resetDatabase();
    await execute(sql.insert_grading_job);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await closeRecoveredGradingJobLocks();
    await database.dropDatabase();
  });

  it('waits for an active delivery and replays its durable result without grading twice', async () => {
    let resultsUploaded = false;
    const headObject = vi.spyOn(S3.prototype, 'headObject').mockImplementation(async () => {
      if (!resultsUploaded) throw new NotFound({ $metadata: {}, message: 'Not found' });
      return { $metadata: {} };
    });
    const send = vi.spyOn(SQSClient.prototype, 'send').mockImplementation(async () => ({}));
    const started = withResolvers();
    const finishGrading = withResolvers();
    const grade = vi.fn(async () => {
      started.resolve(null);
      await finishGrading.promise;
      resultsUploaded = true;
    });

    const first = handleRecoveredGradingJob(job, grade);
    await started.promise;
    const second = handleRecoveredGradingJob(job, grade);
    try {
      await expect.poll(() => queryScalar(sql.has_waiting_grading_job, z.boolean())).toBe(true);
      expect(grade).toHaveBeenCalledOnce();
      expect(headObject).toHaveBeenCalledOnce();
    } finally {
      finishGrading.resolve(null);
      await Promise.all([first, second]);
    }

    expect(grade).toHaveBeenCalledOnce();
    expect(headObject).toHaveBeenLastCalledWith({
      Bucket: job.s3Bucket,
      Key: `${job.s3RootKey}/results.json`,
    });
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0][0]).toMatchObject({
      input: {
        QueueUrl: config.resultsQueueUrl,
        MessageBody: JSON.stringify({ jobId: job.jobId, event: 'grading_result' }),
      },
    });
  });

  it('rechecks cancellation after waiting for another delivery', async () => {
    const headObject = vi.spyOn(S3.prototype, 'headObject').mockImplementation(async () => {
      throw new NotFound({ $metadata: {}, message: 'Not found' });
    });
    const started = withResolvers();
    const finishGrading = withResolvers();
    const grade = vi.fn(async () => {
      started.resolve(null);
      await finishGrading.promise;
    });

    const first = handleRecoveredGradingJob(job, grade);
    await started.promise;
    const second = handleRecoveredGradingJob(job, grade);
    try {
      await expect.poll(() => queryScalar(sql.has_waiting_grading_job, z.boolean())).toBe(true);
      await execute(sql.cancel_grading_job);
    } finally {
      finishGrading.resolve(null);
      await Promise.all([first, second]);
    }

    expect(grade).toHaveBeenCalledOnce();
    expect(headObject).toHaveBeenCalledOnce();
  });

  it('preserves an unreadable result and releases the lock for another delivery', async () => {
    const accessDenied = new S3ServiceException({
      name: 'AccessDenied',
      $fault: 'client',
      $metadata: { httpStatusCode: 403 },
    });
    const headObject = vi
      .spyOn(S3.prototype, 'headObject')
      .mockImplementationOnce(async () => {
        throw accessDenied;
      })
      .mockImplementation(async () => ({ $metadata: {} }));
    const send = vi.spyOn(SQSClient.prototype, 'send').mockImplementation(async () => ({}));
    const grade = vi.fn();

    await expect(handleRecoveredGradingJob(job, grade)).rejects.toThrow(accessDenied);
    expect(grade).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();

    await handleRecoveredGradingJob(job, grade);

    expect(headObject).toHaveBeenCalledTimes(2);
    expect(grade).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledOnce();
  });
});
