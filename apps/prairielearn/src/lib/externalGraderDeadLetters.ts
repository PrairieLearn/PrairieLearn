import {
  DeleteMessageCommand,
  GetQueueUrlCommand,
  ReceiveMessageCommand,
  type ReceiveMessageResult,
  SQSClient,
} from '@aws-sdk/client-sqs';

import { logger } from '@prairielearn/logger';
import * as Sentry from '@prairielearn/sentry';
import { withResolvers } from '@prairielearn/utils';
import { IdSchema } from '@prairielearn/zod';

import { makeAwsClientConfig } from './aws.js';
import { config } from './config.js';
import { processGradingResult } from './externalGrader.js';

const abortController = new AbortController();
const processingFinished = withResolvers();
let enabled = false;

export async function init() {
  if (!config.externalGradingUseAws) return;

  const jobsDLQName = config.externalGradingJobsDeadLetterQueueName;
  const resultsDLQName = config.externalGradingResultsDeadLetterQueueName;
  if (!jobsDLQName || !resultsDLQName) return;

  enabled = true;

  const sqs = new SQSClient(makeAwsClientConfig());
  const jobsQueueUrl = await loadQueueUrl(sqs, jobsDLQName);
  const resultsQueueUrl = await loadQueueUrl(sqs, resultsDLQName);

  // Start both polling loops concurrently in the background.
  void Promise.all([
    pollQueue(sqs, jobsQueueUrl, jobsDLQName),
    pollQueue(sqs, resultsQueueUrl, resultsDLQName),
  ]).then(() => {
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

async function loadQueueUrl(sqs: SQSClient, queueName: string): Promise<string> {
  logger.verbose(`Dead letter queue ${queueName}: getting URL...`);
  const data = await sqs.send(new GetQueueUrlCommand({ QueueName: queueName }));
  const queueUrl = data.QueueUrl;
  if (!queueUrl) {
    throw new Error(`Could not get URL for queue ${queueName}`);
  }
  logger.verbose(`Dead letter queue ${queueName}: got URL ${queueUrl}`);
  return queueUrl;
}

async function pollQueue(sqs: SQSClient, queueUrl: string, queueName: string) {
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
          }),
        );
        messages = data.Messages;
      } catch (err) {
        logger.error(`Error receiving messages from dead letter queue ${queueName}`, err);
        Sentry.captureException(err);
        continue;
      }
    }

    // Wait for all messages to be processed.
    await Promise.all(
      messages.map(async (message) => {
        try {
          if (!message.Body) throw new Error('Message is missing Body');
          if (!message.ReceiptHandle) throw new Error('Message is missing ReceiptHandle');

          const parsedMessage = JSON.parse(message.Body);
          const receiptHandle = message.ReceiptHandle;

          await processDeadLetterMessage(parsedMessage, queueName);

          await sqs.send(
            new DeleteMessageCommand({
              QueueUrl: queueUrl,
              ReceiptHandle: receiptHandle,
            }),
          );
        } catch (err) {
          logger.error(`Error processing dead letter message from ${queueName}`, err);
          Sentry.captureException(err);
        }
      }),
    );
  }
}

async function processDeadLetterMessage(data: Record<string, unknown>, queueName: string) {
  let jobId: string;
  try {
    jobId = IdSchema.parse(data.jobId);
  } catch {
    logger.error('Dead letter message does not contain a valid grading job id', { data });
    Sentry.captureException(new Error('Dead letter message does not contain a valid job id'), {
      extra: { queueName, data },
    });
    return;
  }

  logger.error('Grading job found in dead letter queue', {
    grading_job_id: jobId,
    queueName,
    data,
  });
  Sentry.captureException(new Error('Grading job found in dead letter queue'), {
    extra: { grading_job_id: jobId, queueName, data },
  });

  try {
    await processGradingResult({
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
      err,
    });
    Sentry.captureException(err);
  }
}
