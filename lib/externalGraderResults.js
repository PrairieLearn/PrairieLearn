const ERR = require('async-stacktrace');
const async = require('async');
const sqldb = require('../prairielib/lib/sql-db');
const sqlLoader = require('../prairielib/lib/sql-loader');
const error = require('../prairielib/lib/error');
const AWS = require('aws-sdk');

const config = require('./config');
const sql = sqlLoader.loadSqlEquiv(__filename);
const externalGradingSocket = require('./externalGradingSocket');
const assessment = require('./assessment');
const externalGraderCommon = require('./externalGraderCommon');
const logger = require('./logger');

// After loading the queue url for the first time, we'll cache it here
let QUEUE_URL = null;

module.exports.init = function (callback) {
  // If we're not configured to use AWS, don't try to do anything here
  if (!config.externalGradingUseAws) {
    return callback(null);
  }

  const sqs = new AWS.SQS(config.awsServiceGlobalOptions);
  loadQueueUrl(sqs, (err) => {
    if (ERR(err, callback)) return;
    callback(null);
    async.forever((next) => {
      async.waterfall(
        [
          (callback) => {
            async.doUntil(
              (done) => {
                const params = {
                  MaxNumberOfMessages: 10,
                  QueueUrl: QUEUE_URL,
                  WaitTimeSeconds: 20,
                };
                sqs.receiveMessage(params, (err, data) => {
                  if (ERR(err, done)) return;
                  if (!data.Messages) {
                    return done(null, null);
                  }
                  done(null, data.Messages);
                });
              },
              (messages, callback) => {
                callback(null, !!messages);
              },
              (err, messages) => {
                if (ERR(err, callback)) return;
                callback(null, messages);
              }
            );
          },
          (messages, callback) => {
            async.each(
              messages,
              (message, callback) => {
                let parsedMessage;
                let receiptHandle;
                try {
                  parsedMessage = JSON.parse(message.Body);
                  receiptHandle = message.ReceiptHandle;
                } catch (e) {
                  return callback(e);
                }

                processMessage(parsedMessage, (err) => {
                  // We're just going to black-hole errors here
                  if (ERR(err, (err) => logger.error('Error processing message', err)));

                  const deleteParams = {
                    QueueUrl: QUEUE_URL,
                    ReceiptHandle: receiptHandle,
                  };
                  sqs.deleteMessage(deleteParams, (err) => {
                    if (ERR(err, callback)) return;
                    return callback(null);
                  });
                });
              },
              (err) => {
                if (ERR(err, callback)) return;
                return callback(null);
              }
            );
          },
        ],
        (err) => {
          if (ERR(err, (err) => logger.error('Error handling grader results', err)));
          next();
        }
      );
    });
  });
};

function loadQueueUrl(sqs, callback) {
  if (QUEUE_URL !== null) {
    callback(null);
  } else {
    logger.verbose(
      `External grading results queue ${config.externalGradingResultsQueueName}: getting URL...`
    );
    const params = {
      QueueName: config.externalGradingResultsQueueName,
    };
    sqs.getQueueUrl(params, (err, data) => {
      if (ERR(err, callback)) return;
      QUEUE_URL = data.QueueUrl;
      logger.verbose(
        `External grading results queue ${config.externalGradingResultsQueueName}: got URL ${QUEUE_URL}`
      );
      callback(null);
    });
  }
}

function logAtTimeout(jobId, logBundle) {
  logger.info('externalGradingResults timeout', { jobId, logBundle });
}

function processMessage(data, callback) {
  let jobId;
  try {
    jobId = Number.parseInt(data.jobId);
    if (Number.isNaN(jobId)) {
      throw new Error();
    }
  } catch (e) {
    return callback(error.makeWithData('Message does not contain a valid grading job id.', data));
  }

  var logBundle = [];
  var loggingTimeout = setTimeout(logAtTimeout, 10000, jobId, logBundle);

  logBundle.push({ timestamp: Date.now(), msg: 'processMessage', data });
  logger.verbose('Processing external grading job result message', {
    grading_job_id: jobId,
    ...data,
  });
  if (data.event === 'job_received') {
    logBundle.push({ timestamp: Date.now(), msg: 'job_received' });
    const params = {
      grading_job_id: jobId,
      received_time: data.data.receivedTime,
    };
    sqldb.queryOneRow(sql.update_grading_received_time, params, (err, _result) => {
      if (ERR(err, callback)) return;
      externalGradingSocket.gradingJobStatusUpdated(jobId);
      clearTimeout(loggingTimeout);
      callback(null);
    });
  } else if (data.event === 'grading_result') {
    logBundle.push({ timestamp: Date.now(), msg: 'grading_result' });
    let s3Bucket, s3RootKey;
    async.series(
      [
        (callback) => {
          const params = {
            grading_job_id: jobId,
          };
          sqldb.queryOneRow(sql.get_job_details, params, (err, result) => {
            if (err) {
              clearTimeout(loggingTimeout);
              return callback(error.makeWithData(`Job ${jobId} could not be found`, data));
            }
            s3Bucket = result.rows[0].s3_bucket;
            s3RootKey = result.rows[0].s3_root_key;
            clearTimeout(loggingTimeout);
            return callback(null);
          });
        },
        (callback) => {
          // It's possible that the results data was specified in the body;
          // if that's the case, we can process it directly. Otherwise, we
          // have to download it from S3 first.
          if (data.data) {
            // We have the data!
            logBundle.push({ timestamp: Date.now(), msg: 'data in data' });
            processResults(jobId, data.data);
            logBundle.push({
              timestamp: Date.now(),
              msg: 'finish with data in data',
            });
            clearTimeout(loggingTimeout);
            callback(null);
          } else {
            // We should fetch it from S3, and then process it
            const params = {
              Bucket: s3Bucket,
              Key: `${s3RootKey}/results.json`,
              ResponseContentType: 'application/json',
            };
            logBundle.push({ timestamp: Date.now(), msg: 'fetching from s3' });
            new AWS.S3(config.awsServiceGlobalOptions).getObject(params, (err, s3Data) => {
              if (ERR(err, callback)) return;
              logBundle.push({
                timestamp: Date.now(),
                msg: 'finished with s3 fetch',
              });
              processResults(jobId, s3Data.Body);
              logBundle.push({
                timestamp: Date.now(),
                msg: 'finish with s3 data',
              });
              clearTimeout(loggingTimeout);
              callback(null);
            });
          }
        },
      ],
      (err) => {
        if (ERR(err, callback)) return;
        callback(null);
      }
    );
  } else {
    logger.error('Invalid grading event received:', data);
    return callback(error.makeWithData(`Unknown grading event: ${data.event}`, data));
  }
}

function processResults(jobId, data) {
  assessment.processGradingResult(externalGraderCommon.makeGradingResult(jobId, data));
}
