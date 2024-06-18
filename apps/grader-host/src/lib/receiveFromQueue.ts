import { setTimeout as sleep } from 'node:timers/promises';
import * as path from 'path';

import {
  ReceiveMessageCommand,
  ChangeMessageVisibilityCommand,
  DeleteMessageCommand,
  SQSClient,
} from '@aws-sdk/client-sqs';
import { Ajv, ValidateFunction } from 'ajv';
import fs from 'fs-extra';

import * as Sentry from '@prairielearn/sentry';

import { config } from './config.js';
import globalLogger from './logger.js';

let messageSchema: ValidateFunction | null = null;

async function changeVisibilityTimeout(
  sqs: SQSClient,
  queueUrl: string,
  receiptHandle: string,
  timeout: number,
) {
  await sqs.send(
    new ChangeMessageVisibilityCommand({
      QueueUrl: queueUrl,
      ReceiptHandle: receiptHandle,
      VisibilityTimeout: timeout,
    }),
  );
}

async function startHeartbeat(sqs: SQSClient, queueUrl: string, receiptHandle: string) {
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

async function receiveMessageFromQueue(sqs: SQSClient, queueUrl: string) {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const data = await sqs.send(
      new ReceiveMessageCommand({
        MaxNumberOfMessages: 1,
        QueueUrl: queueUrl,
        WaitTimeSeconds: 20,
      }),
    );
    const message = data.Messages?.[0];
    if (!message || !message.Body) continue;
    globalLogger.info('Received job!');
    const parsedMessage = JSON.parse(message.Body);
    const receiptHandle = message.ReceiptHandle as string;
    return { parsedMessage, receiptHandle };
  }
}

export async function receiveFromQueue(
  sqs: SQSClient,
  queueUrl: string,
  receiveCallback: (message: any) => Promise<void>,
) {
  globalLogger.info('Waiting for next job...');
  const { parsedMessage, receiptHandle } = await receiveMessageFromQueue(sqs, queueUrl);

  if (!messageSchema) {
    const data = await fs.readJson(path.join(import.meta.dirname, 'messageSchema.json'));
    const ajv = new Ajv();
    messageSchema = ajv.compile(data);
  }

  const valid = messageSchema(parsedMessage);
  if (!valid) {
    globalLogger.error(messageSchema.errors);
    throw new Error('Message did not match schema.');
  }

  const heartbeatAbortController = await startHeartbeat(sqs, queueUrl, receiptHandle);

  await receiveCallback(parsedMessage)
    .finally(() => {
      heartbeatAbortController.abort();
    })
    .then(
      () => {
        globalLogger.info(`Job ${parsedMessage.jobId} finished successfully.`);
      },
      (err) => {
        globalLogger.info(`Job ${parsedMessage.jobId} errored.`);
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
