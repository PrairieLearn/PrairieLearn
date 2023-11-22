// @ts-check
import { S3 } from '@aws-sdk/client-s3';
import {
  SQSClient,
  GetQueueUrlCommand,
  ReceiveMessageCommand,
  DeleteMessageCommand,
} from '@aws-sdk/client-sqs';
import * as error from '@prairielearn/error';
import { logger } from '@prairielearn/logger';
import * as sqldb from '@prairielearn/postgres';
import * as Sentry from '@prairielearn/sentry';

import { makeS3ClientConfig, makeAwsClientConfig } from './aws';
import { config } from './config';
import { gradingJobStatusUpdated } from './externalGradingSocket';
import { processGradingResult } from './externalGrader';
import * as externalGraderCommon from './externalGraderCommon';
import { deferredPromise } from './deferred';

const sql = sqldb.loadSqlEquiv(__filename);

const abortController = new AbortController();
const processingFinished = deferredPromise();

export async function init() {
  // If we're not configured to use AWS, don't try to do anything here
  if (!config.externalGradingUseAws) return;

  const sqs = new SQSClient(makeAwsClientConfig());
  const queueUrl = await loadQueueUrl(sqs);

  // Start work in an IIFE so we can keep going asynchronously
  // after we return to the caller.
  (async () => {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      // Spin until we can get at least one message from the queue.
      let messages = null;
      while (messages == null) {
        // Only attempt to abort before we receive any messages. Once we
        // receive them, we should not mark ourselves as finished until we've
        // actually processed all of them.
        if (abortController.signal.aborted) {
          processingFinished.resolve(null);
          return;
        }

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
          logger.error('Error receiving messages from SQS', err);
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

            await processMessage(parsedMessage);

            await sqs.send(
              new DeleteMessageCommand({
                QueueUrl: queueUrl,
                ReceiptHandle: receiptHandle,
              }),
            );
          } catch (err) {
            logger.error('Error processing external grader results', err);
            Sentry.captureException(err);
          }
        }),
      );
    }
  })().then(() => {
    // Do nothing
  });
}

export async function stop() {
  if (!config.externalGradingUseAws) return;

  if (abortController.signal.aborted) {
    throw new Error('Already stopped');
  }

  abortController.abort();

  // The main work loop will resolve this deferred promise when it's finished
  // with any current processing.
  await processingFinished.promise;
}

/**
 * @param {SQSClient} sqs
 * @returns {Promise<string>} The URL of the results queue.
 */
async function loadQueueUrl(sqs) {
  logger.verbose(
    `External grading results queue ${config.externalGradingResultsQueueName}: getting URL...`,
  );
  const data = await sqs.send(
    new GetQueueUrlCommand({ QueueName: config.externalGradingResultsQueueName }),
  );
  const queueUrl = data.QueueUrl;
  if (!queueUrl) {
    throw new Error(`Could not get URL for queue ${config.externalGradingResultsQueueName}`);
  }
  logger.verbose(
    `External grading results queue ${config.externalGradingResultsQueueName}: got URL ${queueUrl}`,
  );
  return queueUrl;
}

async function processMessage(data) {
  const jobId = Number.parseInt(data.jobId);
  if (Number.isNaN(jobId)) {
    throw error.makeWithData('Message does not contain a valid grading job id.', data);
  }

  logger.verbose('Processing external grading job result message', {
    grading_job_id: jobId,
    ...data,
  });
  if (data.event === 'job_received') {
    await sqldb.queryOneRowAsync(sql.update_grading_received_time, {
      grading_job_id: jobId,
      received_time: data.data.receivedTime,
    });
    gradingJobStatusUpdated(jobId);
    return;
  } else if (data.event === 'grading_result') {
    // Figure out where we can fetch results from.
    const jobDetails = await sqldb.queryOneRowAsync(sql.get_job_details, {
      grading_job_id: jobId,
    });
    const s3Bucket = jobDetails.rows[0].s3_bucket;
    const s3RootKey = jobDetails.rows[0].s3_root_key;

    // Depending on the size of the results, the grader may have included
    // them in the message body. If so, we'll use them directly. If we
    // don't find the results data in the message body, we'll fetch the
    // results from S3 instead.
    if (data.data) {
      // We have the data!
      await processResults(jobId, data.data);
      return;
    } else {
      // We should fetch it from S3, and then process it
      const s3Client = new S3(makeS3ClientConfig());
      const data = await s3Client.getObject({
        Bucket: s3Bucket,
        Key: `${s3RootKey}/results.json`,
        ResponseContentType: 'application/json',
      });
      if (!data.Body) throw new Error('No body in S3 response');
      await processResults(jobId, await data.Body.transformToString());
      return;
    }
  } else {
    throw error.makeWithData(`Unknown grading event: ${data.event}`, data);
  }
}

async function processResults(jobId, data) {
  await processGradingResult(externalGraderCommon.makeGradingResult(jobId, data));
}
