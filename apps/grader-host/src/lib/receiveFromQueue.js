// @ts-check
import { setTimeout as sleep } from 'node:timers/promises';

import {
  ReceiveMessageCommand,
  ChangeMessageVisibilityCommand,
  DeleteMessageCommand,
} from '@aws-sdk/client-sqs';
import * as async from 'async';
import { z } from 'zod';

import * as Sentry from '@prairielearn/sentry';

import { config } from './config.js';
import globalLogger from './logger.js';

const GradingJobMessageSchema = z.object({
  /** The unique ID for this job. */
  jobId: z.string(),
  /** The Docker image that the grading job will be executed in. */
  image: z.string(),
  /** The entrypoint for the container. */
  entrypoint: z.string(),
  /** The number of seconds after which the grading job will time out. */
  timeout: z.number(),
  /** Whether or not the container should have internet access. */
  enableNetworking: z.boolean(),
  /** Environment variables for the container. */
  environment: z.record(z.string()),
  /** The AWS S3 bucket containing this job's files. */
  s3Bucket: z.string(),
  /** The root key for the job's files. */
  s3RootKey: z.string(),
});

/** @typedef {z.infer<typeof GradingJobMessageSchema>} GradingJobMessage */

/**
 * @param {import('@aws-sdk/client-sqs').SQSClient} sqs
 * @param {string} queueUrl
 * @param {string} receiptHandle
 * @param {number} timeout
 * @returns {Promise<void>}
 */
async function changeVisibilityTimeout(sqs, queueUrl, receiptHandle, timeout) {
  await sqs.send(
    new ChangeMessageVisibilityCommand({
      QueueUrl: queueUrl,
      ReceiptHandle: receiptHandle,
      VisibilityTimeout: timeout,
    }),
  );
}

/**
 * @param {import('@aws-sdk/client-sqs').SQSClient} sqs
 * @param {string} queueUrl
 * @param {string} receiptHandle
 */
async function startHeartbeat(sqs, queueUrl, receiptHandle) {
  const abortController = new AbortController();

  // Run the first extension immediately before we start processing the job.
  await changeVisibilityTimeout(sqs, queueUrl, receiptHandle, config.visibilityTimeout);

  // We want this process to run in the background, so we don't await it.
  // `extendVisibilityTimeout` will handle errors.
  // eslint-disable-next-line no-floating-promise/no-floating-promise
  (async () => {
    while (!abortController.signal.aborted) {
      await sleep(config.visibilityTimeoutHeartbeatIntervalSec * 1000, null, { ref: false });

      if (abortController.signal.aborted) return;

      try {
        await changeVisibilityTimeout(sqs, queueUrl, receiptHandle, config.visibilityTimeout);
      } catch (err) {
        globalLogger.error('Error extending visibility timeout', err);
        Sentry.captureException(err);
      }
    }
  })();

  return abortController;
}

/**
 *
 * @param {import('@aws-sdk/client-sqs').SQSClient} sqs
 * @param {string} queueUrl
 * @param {(message: GradingJobMessage) => Promise<void>} receiveCallback
 */
export async function receiveFromQueue(sqs, queueUrl, receiveCallback) {
  /** @type {AbortController} */
  let heartbeatAbortController;

  globalLogger.info('Waiting for next job...');
  const { parsedMessage, receiptHandle } = await async.doUntil(
    async () => {
      const data = await sqs.send(
        new ReceiveMessageCommand({
          MaxNumberOfMessages: 1,
          QueueUrl: queueUrl,
          WaitTimeSeconds: 20,
        }),
      );
      const message = data.Messages?.[0];
      if (!message || !message.Body) return null;
      globalLogger.info('Received job!');
      const parsedMessage = JSON.parse(message.Body);
      const receiptHandle = message.ReceiptHandle;
      return { parsedMessage, receiptHandle };
    },
    async (result) => {
      return !!result;
    },
  );

  const validatedMessage = GradingJobMessageSchema.parse(parsedMessage);

  heartbeatAbortController = await startHeartbeat(sqs, queueUrl, receiptHandle);

  await receiveCallback(validatedMessage)
    .finally(() => {
      heartbeatAbortController.abort();
    })
    .then(
      () => {
        globalLogger.info(`Job ${validatedMessage.jobId} finished successfully.`);
      },
      (err) => {
        globalLogger.info(`Job ${validatedMessage.jobId} errored.`);
        throw err;
      },
    );

  await sqs.send(
    new DeleteMessageCommand({
      QueueUrl: queueUrl,
      ReceiptHandle: receiptHandle,
    }),
  );
}
