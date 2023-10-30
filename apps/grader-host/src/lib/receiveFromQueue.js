// @ts-check
const ERR = require('async-stacktrace');
const async = require('async');
const fs = require('fs-extra');
const path = require('path');
const Ajv = require('ajv').default;
const {
  ReceiveMessageCommand,
  ChangeMessageVisibilityCommand,
  DeleteMessageCommand,
} = require('@aws-sdk/client-sqs');

const globalLogger = require('./logger');
const { config } = require('./config');

let messageSchema = null;

/**
 *
 * @param {import('@aws-sdk/client-sqs').SQSClient} sqs
 * @param {string} queueUrl
 * @param {Function} receiveCallback
 * @param {Function} doneCallback
 */
module.exports = function (sqs, queueUrl, receiveCallback, doneCallback) {
  let parsedMessage, receiptHandle;
  async.series(
    [
      (callback) => {
        globalLogger.info('Waiting for next job...');
        async.doUntil(
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
            parsedMessage = JSON.parse(message.Body);
            receiptHandle = message.ReceiptHandle;
            return parsedMessage;
          },
          (result, callback) => {
            callback(null, !!result);
          },
          (err) => {
            if (ERR(err, callback)) return;
            callback(null);
          },
        );
      },
      (callback) => {
        if (!messageSchema) {
          fs.readJson(path.join(__dirname, 'messageSchema.json'), (err, data) => {
            if (ERR(err, (err) => globalLogger.error(err))) {
              globalLogger.error('Failed to read message schema; exiting process.');
              process.exit(1);
            }
            const ajv = new Ajv();
            messageSchema = ajv.compile(data);
            return callback(null);
          });
        } else {
          return callback(null);
        }
      },
      (callback) => {
        const valid = messageSchema(parsedMessage);
        if (!valid) {
          globalLogger.error(messageSchema.errors);
          return callback(new Error('Message did not match schema.'));
        } else {
          return callback(null);
        }
      },
      async () => {
        const timeout = parsedMessage.timeout || config.defaultTimeout;
        // Add additional time to account for pulling the image, downloading/uploading files, etc.
        const newTimeout = timeout + config.timeoutOverhead;
        await sqs.send(
          new ChangeMessageVisibilityCommand({
            QueueUrl: queueUrl,
            ReceiptHandle: receiptHandle,
            VisibilityTimeout: newTimeout,
          }),
        );
      },
      (callback) => {
        receiveCallback(
          parsedMessage,
          (err) => {
            globalLogger.info(`Job ${parsedMessage.jobId} errored.`);
            callback(err);
          },
          () => {
            globalLogger.info(`Job ${parsedMessage.jobId} finished successfully.`);
            callback(null);
          },
        );
      },
      async () => {
        await sqs.send(
          new DeleteMessageCommand({
            QueueUrl: queueUrl,
            ReceiptHandle: receiptHandle,
          }),
        );
      },
    ],
    (err) => {
      if (ERR(err, doneCallback)) return;
      doneCallback(null);
    },
  );
};
