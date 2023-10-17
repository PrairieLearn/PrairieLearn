// @ts-check
const ERR = require('async-stacktrace');
const async = require('async');
const {
  SQSClient,
  GetQueueUrlCommand,
  ReceiveMessageCommand,
  DeleteMessageCommand,
} = require('@aws-sdk/client-sqs');
const { logger } = require('@prairielearn/logger');

const { makeAwsClientConfig } = require('../lib/aws');
const { config } = require('../lib/config');
const opsbot = require('../lib/opsbot');

// After loading the queue url for the first time, we'll cache it here
const QUEUE_URLS = {};

module.exports.run = (callback) => {
  if (!opsbot.canSendMessages()) return callback(null);

  const jobsDeadLetterQueueName = config.externalGradingJobsDeadLetterQueueName;
  const resultsDeadLetterQueueName = config.externalGradingResultsDeadLetterQueueName;
  if (!config.externalGradingUseAws || !jobsDeadLetterQueueName || !resultsDeadLetterQueueName) {
    return callback(null);
  }

  const sqs = new SQSClient(makeAwsClientConfig());

  let msg;
  async.series(
    [
      async () => {
        await loadQueueUrl(sqs, jobsDeadLetterQueueName);
        await loadQueueUrl(sqs, resultsDeadLetterQueueName);
        const jobsMessages = await getDeadLetterMsg(sqs, jobsDeadLetterQueueName);
        const resultsMessages = await getDeadLetterMsg(sqs, resultsDeadLetterQueueName);
        msg = jobsMessages + resultsMessages;
      },
      async () => {
        await opsbot
          .sendMessage(msg)
          .catch((err) =>
            logger.error(`Error posting external grading dead letters to slack`, err.data),
          );
      },
    ],
    (err) => {
      if (ERR(err, callback)) return;
      callback(null);
    },
  );
};

/**
 * @param {SQSClient} sqs
 * @param {string} queueName
 */
async function loadQueueUrl(sqs, queueName) {
  if (QUEUE_URLS[queueName] != null) return;

  logger.verbose(`Dead letter queue ${queueName}: getting URL...`);
  const data = await sqs.send(new GetQueueUrlCommand({ QueueName: queueName }));
  QUEUE_URLS[queueName] = data.QueueUrl;
  logger.verbose(`Dead letter queue ${queueName}: got URL ${QUEUE_URLS[queueName]}`);
}

/**
 * @param {SQSClient} sqs
 * @param {string} queueName
 */
async function getDeadLetterMsg(sqs, queueName) {
  const messages = await drainQueue(sqs, queueName);
  let msgDL = `_Dead letter queue, past 24 hours:_ *${queueName}:* count: ${messages.length}\n`;
  for (let message of messages) {
    msgDL += JSON.stringify(message) + '\n';
  }
  logger.verbose('cron:sendExternalGraderDeadLetters', {
    queue: queueName,
    count: messages.length,
    messages,
  });
  return msgDL;
}

/**
 * @param {SQSClient} sqs
 * @param {string} queueName
 */
async function drainQueue(sqs, queueName) {
  const messages = [];
  await async.doWhilst(
    async () => {
      const data = await sqs.send(
        new ReceiveMessageCommand({
          MaxNumberOfMessages: 10,
          QueueUrl: QUEUE_URLS[queueName],
          WaitTimeSeconds: 20,
        }),
      );
      if (!data.Messages) {
        // stop with message collection
        return false;
      }
      await async.each(data.Messages, async (message) => {
        if (!message.Body) return;
        const parsedMessage = JSON.parse(message.Body);
        const receiptHandle = message.ReceiptHandle;
        messages.push(parsedMessage);
        await sqs.send(
          new DeleteMessageCommand({
            QueueUrl: QUEUE_URLS[queueName],
            ReceiptHandle: receiptHandle,
          }),
        );
      });

      // keep getting messages if we got some this time
      return true;
    },
    async (keepGoing) => keepGoing,
  );
  return messages;
}
