const ERR = require('async-stacktrace');
const async = require('async');
const EventEmitter = require('events');
const fs = require('fs-extra');
const targz = require('tar.gz');
const csrf = require('./csrf');
const _ = require('lodash');
const AWS = require('aws-sdk');

const globalConfig = require('./config');
const externalGraderCommon = require('./externalGraderCommon');

let QUEUE_URL = null;

class Grader {
    handleGradingRequest(grading_job, submission, variant, question, course, configOverrides) {
        const config = _.cloneDeep(globalConfig);
        _.assign(config, configOverrides);

        const emitter = new EventEmitter();

        const dir = externalGraderCommon.getJobDirectory(grading_job.id);

        async.series([
            (callback) => {
                externalGraderCommon.buildDirectory(dir, submission, variant, question, course, callback);
            },
            (callback) => {
                // Now that we've built up our directory, let's zip it up and send
                // it off to S3
                let tarball = new targz({}, {
                    fromBase: true,
                });

                let tarSrc = tarball.createReadStream(dir);

                const params = {
                    Bucket: config.externalGradingJobsS3Bucket,
                    Key: `job_${grading_job.id}.tar.gz`,
                };

                let s3Stream = require('s3-upload-stream')(new AWS.S3());
                let upload = s3Stream.upload(params);

                upload.on('error', (err) => {
                    ERR(err, callback);
                });

                upload.on('uploaded', () => {
                    callback(null);
                });

                tarSrc.pipe(upload);
            },
            (callback) => {
                sendJobToQueue(grading_job.id, question, config, (err) => {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            }
        ], (err) => {
            fs.remove(dir);
            if (err) {
                emitter.emit('error', err);
            } else {
                emitter.emit('submit');
            }
        });

        return emitter;
    }
}

function sendJobToQueue(jobId, question, config, callback) {
    const sqs = new AWS.SQS();
    async.series([
        (callback) => {
            if (QUEUE_URL) {
                callback(null);
            } else {
                const params = {
                    QueueName: config.externalGradingSqsQueueName
                };
                sqs.getQueueUrl(params, (err, data) => {
                    if (ERR(err, callback)) return;
                    QUEUE_URL = data.QueueUrl;
                    callback(null);
                });
            }
        },
        (callback) => {
            const messageBody = {
                jobId: jobId,
                image: question.external_grading_image,
                entrypoint: question.external_grading_entrypoint,
                s3JobsBucket: config.externalGradingJobsS3Bucket,
                s3ResultsBucket: config.externalGradingResultsS3Bucket,
                s3ArchivesBucket: config.externalGradingArchivesS3Bucket,
                webhookUrl: config.externalGradingWebhookUrl,
                csrfToken: csrf.generateToken({url: '/pl/webhooks/grading'}, config.secretKey)
            };
            const params = {
                QueueUrl: QUEUE_URL,
                MessageBody: JSON.stringify(messageBody)
            };
            sqs.sendMessage(params, (err) => {
                if (ERR(err, callback)) return;
                callback(null);
            });
        }
    ], (err) => {
        if (ERR(err, callback)) return;
        callback(null);
    });
}

module.exports = Grader;
