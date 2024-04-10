import * as async from 'async';
import {
  SQSClient,
  GetQueueUrlCommand,
  ReceiveMessageCommand,
  DeleteMessageCommand,
} from '@aws-sdk/client-sqs';
import { logger } from '@prairielearn/logger';

import { makeAwsClientConfig } from '../lib/aws';
import { config } from '../lib/config';
import * as opsbot from '../lib/opsbot';

// After loading the queue url for the first time, we'll cache it here
const QUEUE_URLS = {};

export async function run() {
  if (!opsbot.canSendMessages()) return;

  const jobsDeadLetterQueueName = config.externalGradingJobsDeadLetterQueueName;
  const resultsDeadLetterQueueName = config.externalGradingResultsDeadLetterQueueName;
  if (!config.externalGradingUseAws || !jobsDeadLetterQueueName || !resultsDeadLetterQueueName) {
    return;
  }

  const sqs = new SQSClient(makeAwsClientConfig());

  await loadQueueUrl(sqs, jobsDeadLetterQueueName);
  await loadQueueUrl(sqs, resultsDeadLetterQueueName);
  const jobsMessages = await getDeadLetterMsg(sqs, jobsDeadLetterQueueName);
  const resultsMessages = await getDeadLetterMsg(sqs, resultsDeadLetterQueueName);
  const msg = jobsMessages + resultsMessages;
  await opsbot
    .sendMessage(msg)
    .catch((err) => logger.error(`Error posting external grading dead letters to slack`, err.data));
}

async function loadQueueUrl(sqs: SQSClient, queueName: string) {
  if (QUEUE_URLS[queueName] != null) return;

  logger.verbose(`Dead letter queue ${queueName}: getting URL...`);
  const data = await sqs.send(new GetQueueUrlCommand({ QueueName: queueName }));
  QUEUE_URLS[queueName] = data.QueueUrl;
  logger.verbose(`Dead letter queue ${queueName}: got URL ${QUEUE_URLS[queueName]}`);
}

async function getDeadLetterMsg(sqs: SQSClient, queueName: string) {
  const messages = await drainQueue(sqs, queueName);
  let msgDL = `_Dead letter queue, past 24 hours:_ *${queueName}:* count: ${messages.length}\n`;
  for (const message of messages) {
    msgDL += JSON.stringify(message) + '\n';
  }
  logger.verbose('cron:sendExternalGraderDeadLetters', {
    queue: queueName,
    count: messages.length,
    messages,
  });
  return msgDL;
}

async function drainQueue(sqs: SQSClient, queueName: string) {
  const messages: any[] = [];
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
