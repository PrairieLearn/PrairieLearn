// @ts-check
const sqldb = require('@prairielearn/postgres');
const error = require('@prairielearn/error');
const AWS = require('aws-sdk');

const { config } = require('./config');
const sql = sqldb.loadSqlEquiv(__filename);
const externalGradingSocket = require('./externalGradingSocket');
const assessment = require('./assessment');
const externalGraderCommon = require('./externalGraderCommon');
const { logger } = require('@prairielearn/logger');
const { deferredPromise } = require('./deferred');
const Sentry = require('@prairielearn/sentry');

const abortController = new AbortController();
const processingFinished = deferredPromise();

module.exports.init = async function () {
  // If we're not configured to use AWS, don't try to do anything here
  if (!config.externalGradingUseAws) return;

  const sqs = new AWS.SQS(config.awsServiceGlobalOptions);
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
          const data = await sqs
            .receiveMessage({
              MaxNumberOfMessages: 10,
              QueueUrl: queueUrl,
              WaitTimeSeconds: 20,
            })
            .promise();
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

            await sqs
              .deleteMessage({
                QueueUrl: queueUrl,
                ReceiptHandle: receiptHandle,
              })
              .promise();
          } catch (err) {
            logger.error('Error processing external grader results', err);
            Sentry.captureException(err);
          }
        })
      );
    }
  })().then(() => {
    // Do nothing
  });
};

module.exports.stop = async function () {
  if (!config.externalGradingUseAws) return;

  if (abortController.signal.aborted) {
    throw new Error('Already stopped');
  }

  abortController.abort();

  // The main work loop will resolve this deferred promise when it's finished
  // with any current processing.
  await processingFinished.promise;
};

/**
 *
 * @param {import('aws-sdk').SQS} sqs
 * @returns {Promise<string>} The URL of the results queue.
 */
async function loadQueueUrl(sqs) {
  logger.verbose(
    `External grading results queue ${config.externalGradingResultsQueueName}: getting URL...`
  );
  const data = await sqs
    .getQueueUrl({ QueueName: config.externalGradingResultsQueueName })
    .promise();
  const queueUrl = data.QueueUrl;
  if (!queueUrl) {
    throw new Error(`Could not get URL for queue ${config.externalGradingResultsQueueName}`);
  }
  logger.verbose(
    `External grading results queue ${config.externalGradingResultsQueueName}: got URL ${queueUrl}`
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
    externalGradingSocket.gradingJobStatusUpdated(jobId);
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
      const s3Client = new AWS.S3(config.awsServiceGlobalOptions);
      const data = await s3Client
        .getObject({
          Bucket: s3Bucket,
          Key: `${s3RootKey}/results.json`,
          ResponseContentType: 'application/json',
        })
        .promise();
      await processResults(jobId, data.Body);
      return;
    }
  } else {
    throw error.makeWithData(`Unknown grading event: ${data.event}`, data);
  }
}

async function processResults(jobId, data) {
  await assessment.processGradingResult(externalGraderCommon.makeGradingResult(jobId, data));
}
