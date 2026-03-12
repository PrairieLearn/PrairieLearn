import { setTimeout as sleep } from 'node:timers/promises';

import {
  DeleteMessageCommand,
  type Message,
  ReceiveMessageCommand,
  type ReceiveMessageResult,
  SQSClient,
} from '@aws-sdk/client-sqs';

import { logger } from '@prairielearn/logger';
import * as Sentry from '@prairielearn/sentry';
import { withResolvers } from '@prairielearn/utils';
import { IdSchema } from '@prairielearn/zod';

import { selectOptionalGradingJobById } from '../models/grading-job.js';

import { makeAwsClientConfig } from './aws.js';
import { config } from './config.js';
import { processGradingResult } from './externalGrader.js';
import { getQueueUrl } from './sqs.js';

const abortController = new AbortController();
const processingFinished = withResolvers();
let enabled = false;
type DeadLetterQueueType = 'jobs' | 'results';

export async function init() {
  if (!config.externalGradingUseAws) return;

  const jobsDLQName = config.externalGradingJobsDeadLetterQueueName;
  const resultsDLQName = config.externalGradingResultsDeadLetterQueueName;
  if (!jobsDLQName || !resultsDLQName) return;

  enabled = true;

  const sqs = new SQSClient(makeAwsClientConfig());
  const jobsQueueUrl = await getQueueUrl(sqs, jobsDLQName);
  const resultsQueueUrl = await getQueueUrl(sqs, resultsDLQName);

  // Start both polling loops concurrently in the background.
  void Promise.all([
    pollQueue(sqs, jobsQueueUrl, jobsDLQName, 'jobs'),
    pollQueue(sqs, resultsQueueUrl, resultsDLQName, 'results'),
  ])
    .catch((err) => {
      logger.error('Dead letter queue polling stopped unexpectedly', err);
      Sentry.captureException(err);
    })
    .finally(() => {
      processingFinished.resolve(null);
    });
}

export async function stop() {
  if (!enabled) return;

  if (abortController.signal.aborted) {
    throw new Error('Already stopped');
  }

  abortController.abort();

  // The polling loops will resolve this deferred promise when they're
  // both finished with any current processing.
  await processingFinished.promise;
}

async function pollQueue(
  sqs: SQSClient,
  queueUrl: string,
  queueName: string,
  queueType: DeadLetterQueueType,
) {
  while (true) {
    // Spin until we can get at least one message from the queue.
    let messages: ReceiveMessageResult['Messages'];
    while (messages === undefined) {
      // Only attempt to abort before we receive any messages. Once we
      // receive them, we should not mark ourselves as finished until we've
      // actually processed all of them.
      if (abortController.signal.aborted) return;

      try {
        const data = await sqs.send(
          new ReceiveMessageCommand({
            MaxNumberOfMessages: 10,
            QueueUrl: queueUrl,
            WaitTimeSeconds: 20,
            MessageSystemAttributeNames: ['ApproximateReceiveCount'],
          }),
          { abortSignal: abortController.signal },
        );
        messages = data.Messages;
      } catch (err) {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- aborted from another context
        if (abortController.signal.aborted) return;
        logger.error(`Error receiving messages from dead letter queue ${queueName}`, err);
        Sentry.captureException(err);
        // Back off briefly to avoid tight-looping during sustained AWS failures.
        // Resolve early if a shutdown is requested so we don't block stop().
        await sleep(5000, undefined, { signal: abortController.signal }).catch(() => {});
      }
    }

    // Wait for all messages to be processed.
    await Promise.all(
      messages.map(async (message) => {
        try {
          await processQueueMessage(sqs, queueUrl, message, queueName, queueType);
        } catch (err) {
          logger.error(`Error processing dead letter message from ${queueName}`, err);
          Sentry.captureException(err);
        }
      }),
    );
  }
}

async function processQueueMessage(
  sqs: SQSClient,
  queueUrl: string,
  message: Message,
  queueName: string,
  queueType: DeadLetterQueueType,
) {
  if (!message.ReceiptHandle) {
    throw new Error('Message is missing ReceiptHandle');
  }
  if (!message.Body) {
    logger.error('Dead letter message is missing body', { queueName });
    Sentry.captureException(new Error('Dead letter message is missing body'), {
      extra: { queueName, messageId: message.MessageId },
    });
    await deleteMessage(sqs, queueUrl, message.ReceiptHandle);
    return;
  }

  let parsedMessage: Record<string, unknown>;
  try {
    parsedMessage = JSON.parse(message.Body);
  } catch (err) {
    logger.error('Dead letter message body is not valid JSON', { queueName });
    Sentry.captureException(err, { extra: { queueName, body: message.Body } });
    await deleteMessage(sqs, queueUrl, message.ReceiptHandle);
    return;
  }

  const receiveCount = Number.parseInt(message.Attributes?.ApproximateReceiveCount ?? '1');
  const shouldDelete = await processDeadLetterMessage(parsedMessage, {
    queueName,
    queueType,
    receiveCount,
  });
  if (!shouldDelete) return;
  await deleteMessage(sqs, queueUrl, message.ReceiptHandle);
}

async function deleteMessage(sqs: SQSClient, queueUrl: string, receiptHandle: string) {
  await sqs.send(
    new DeleteMessageCommand({
      QueueUrl: queueUrl,
      ReceiptHandle: receiptHandle,
    }),
  );
}

/** Maximum number of times we'll attempt to process a DLQ message before giving up. */
const MAX_RECEIVE_COUNT = 3;

export async function processDeadLetterMessage(
  data: Record<string, unknown>,
  {
    queueName,
    queueType,
    receiveCount = 1,
    markJobFailed = processGradingResult,
    selectGradingJob = selectOptionalGradingJobById,
  }: {
    queueName: string;
    queueType: DeadLetterQueueType;
    receiveCount?: number;
    markJobFailed?: typeof processGradingResult;
    selectGradingJob?: typeof selectOptionalGradingJobById;
  },
): Promise<boolean> {
  let jobId: string;
  try {
    jobId = IdSchema.parse(data.jobId);
  } catch {
    logger.error('Dead letter message does not contain a valid grading job id', { data });
    Sentry.captureException(new Error('Dead letter message does not contain a valid job id'), {
      extra: { queueName, data },
    });
    return true;
  }

  // Only grading_result events from the results DLQ need to be marked as
  // failed. Other events (e.g. job_received) are informational and can be
  // safely discarded.
  if (queueType === 'results' && data.event !== 'grading_result') {
    return true;
  }

  logger.error('Grading job found in dead letter queue', {
    grading_job_id: jobId,
    queueName,
    data,
  });
  Sentry.captureException(new Error('Grading job found in dead letter queue'), {
    extra: { grading_job_id: jobId, queueName, data },
  });

  // Grading jobs can be hard-deleted when an instructor deletes an
  // assessment instance (or regenerates their own). In that case there's
  // nothing left to mark as failed, so we should acknowledge the message.
  const gradingJob = await selectGradingJob(jobId);
  if (!gradingJob) return true;

  try {
    await markJobFailed({
      gradingId: jobId,
      grading: {
        receivedTime: null,
        startTime: null,
        endTime: null,
        score: 0,
        feedback: {
          succeeded: false,
          message:
            'Your submission could not be graded due to a system error. Please try submitting again.',
        },
        format_errors: {},
      },
    });
  } catch (err) {
    logger.error('Error marking dead letter grading job as failed', {
      grading_job_id: jobId,
      receiveCount,
      err,
    });
    Sentry.captureException(err);
    // Retry up to MAX_RECEIVE_COUNT times for transient failures (e.g. DB
    // unavailable). After that, delete the message to avoid a poison pill
    // that tight-loops forever — the Sentry alert gives ops visibility.
    return receiveCount >= MAX_RECEIVE_COUNT;
  }

  return true;
}
