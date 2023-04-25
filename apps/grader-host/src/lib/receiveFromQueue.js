const ERR = require('async-stacktrace');
const async = require('async');
const fs = require('fs-extra');
const path = require('path');
const Ajv = require('ajv').default;
const sqldb = require('@prairielearn/postgres');

const globalLogger = require('./logger');
const { config } = require('./config');
const sql = sqldb.loadSqlEquiv(__filename);

let messageSchema = null;

module.exports = function (sqs, queueUrl, receiveCallback, doneCallback) {
  let parsedMessage, jobCanceled, receiptHandle;
  async.series(
    [
      (callback) => {
        globalLogger.info('Waiting for next job...');
        async.doUntil(
          (done) => {
            const params = {
              MaxNumberOfMessages: 1,
              QueueUrl: queueUrl,
              WaitTimeSeconds: 20,
            };
            sqs.receiveMessage(params, (err, data) => {
              if (ERR(err, done)) return;
              if (!data.Messages) {
                return done(null, null);
              }
              globalLogger.info('Received job!');
              try {
                parsedMessage = JSON.parse(data.Messages[0].Body);
                receiptHandle = data.Messages[0].ReceiptHandle;
              } catch (e) {
                return done(e);
              }
              return done(null, parsedMessage);
            });
          },
          (result, callback) => {
            callback(null, !!result);
          },
          (err) => {
            if (ERR(err, callback)) return;
            callback(null);
          }
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
      (callback) => {
        const timeout = parsedMessage.timeout || config.defaultTimeout;
        // Add additional time to account for pulling the image, downloading/uploading files, etc.
        const newTimeout = timeout + config.timeoutOverhead;
        const visibilityParams = {
          QueueUrl: queueUrl,
          ReceiptHandle: receiptHandle,
          VisibilityTimeout: newTimeout,
        };
        sqs.changeMessageVisibility(visibilityParams, (err) => {
          if (ERR(err, callback)) return;
          return callback(null);
        });
      },
      (callback) => {
        // If we're configured to use the database, ensure that this job
        // wasn't canceled in the time since job submission
        if (!config.useDatabase) return callback(null);

        const params = {
          grading_job_id: parsedMessage.jobId,
        };
        sqldb.queryOneRow(sql.check_job_cancelation, params, (err, result) => {
          if (ERR(err, callback)) return;
          jobCanceled = result.rows[0].canceled;
          callback(null);
        });
      },
      (callback) => {
        // Don't execute the job if it was canceled
        if (jobCanceled) {
          globalLogger.info(`Job ${parsedMessage.jobId} was canceled; skipping job.`);
          return callback(null);
        }

        receiveCallback(
          parsedMessage,
          (err) => {
            globalLogger.info(`Job ${parsedMessage.jobId} errored.`);
            callback(err);
          },
          () => {
            globalLogger.info(`Job ${parsedMessage.jobId} finished successfully.`);
            callback(null);
          }
        );
      },
      (callback) => {
        const deleteParams = {
          QueueUrl: queueUrl,
          ReceiptHandle: receiptHandle,
        };
        sqs.deleteMessage(deleteParams, (err) => {
          if (ERR(err, callback)) return;
          return callback(null);
        });
      },
    ],
    (err) => {
      if (ERR(err, doneCallback)) return;
      doneCallback(null);
    }
  );
};
