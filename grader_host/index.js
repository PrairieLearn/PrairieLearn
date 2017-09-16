const fs = require('fs');
const async = require('async');
const ERR = require('async-stacktrace');
const Docker = require('dockerode');
const AWS = require('aws-sdk');

const logger = require('./lib/logger');

const config = {};

async.series([
    (callback) => {
        fs.readFile('./aws-config.json', (err, awsConfig) => {
            if (err) {
                logger.log('Missing aws-config.json; this shouldn\'t matter when running in production');
                config.devMode = false;
                AWS.config.update({'region': 'us-east-2'});
            } else {
                logger.log('Loading AWS config from aws-config.json');
                config.devMode = true;
                AWS.config.loadFromPath('./aws-config.json');
                config.awsAccessKeyId = awsConfig.accessKeyId;
                config.awsSecretAccessKey = awsConfig.secretAccessKey;
                config.awsRegion = awsConfig.region;
            }
            callback(null);
        });
    },
    (callback) => {
        config.queueName = process.env.QUEUE_NAME || 'grading';
        if (process.env.QUEUE_URL) {
            logger.info(`Using queue url from QUEUE_URL environment variable: ${process.env.QUEUE_URL}`);
            config.queueUrl = process.env.QUEUE_URL;
            callback(null);
        } else {
            logger.info(`Loading url for queue "${config.queueName}"`);
            const sqs = new AWS.SQS();
            const params = {
                QueueName: config.queueName
            };
            sqs.getQueueUrl(params, (err, data) => {
                if (err) {
                    logger.error(`Unable to load url for queue "${config.queueName}"`);
                    logger.error(err);
                    process.exit(1);
                }
                config.queueUrl = data.QueueUrl;
                logger.info(`Loaded url for queue "${config.queueName}": ${config.queueUrl}`);
                callback(null);
            });
        }
    },
    (callback) => {
        logger.info('Initialization complete! Beginning to process jobs.');
        receiveAndHandleMessage();
        callback(null);
    }
]);


function receiveAndHandleMessage() {
    const sqs = new AWS.SQS();
    async.waterfall([
        (callback) => {
            const params = {
                MaxNumberOfMessages: 1,
                QueueUrl: config.queueUrl,
                WaitTimeSeconds: 20
            };
            sqs.receiveMessage(params, (err, data) => {
                if (ERR(err, callback)) return;
                if (!data.Messages) {
                    return callback(new Error('No message present!'));
                }
                logger.info('Received job!');
                try {
                    const messageBody = data.Messages[0].Body;
                    const receiptHandle = data.Messages[0].ReceiptHandle;
                    return callback(null, receiptHandle, JSON.parse(messageBody));
                } catch (e) {
                    return callback(e);
                }
            });
        },
        (receiptHandle, parsedMessage, callback) => {
            handleMessage(parsedMessage, (err) => {
                if (ERR(err, callback)) return;
                return callback(null, receiptHandle);
            });
        },
        (receiptHandle, callback) => {
            const deleteParams = {
                QueueUrl: config.queueUrl,
                ReceiptHandle: receiptHandle
            };
            sqs.deleteMessage(deleteParams, (err) => {
                if (ERR(err, callback)) return;
                return callback(null);
            });
        }
    ], (err) => {
        if (ERR(err, (err) => logger.error(err)));
        receiveAndHandleMessage();
    });
}

function handleMessage(messageBody, callback) {
    const {
        jobId,
        image,
        entrypoint,
        s3JobsBucket,
        s3ResultsBucket,
        s3ArchivesBucket,
        webhookUrl,
        csrfToken
    } = messageBody;

    const docker = new Docker();

    async.waterfall([
        (callback) => {
            docker.ping((err) => {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
        (callback) => {
            docker.pull(image, (err, stream) => {
                if (err) {
                    logger.warn(`Error pulling "${image}" image; attempting to fall back to cached version.`);
                    logger.warn(err);
                }

                docker.modem.followProgress(stream, (err) => {
                    if (ERR(err, callback)) return;
                    callback(null);
                }, (output) => {
                    logger.info(output);
                });
            });
        },
        (callback) => {
            const env = [
                `JOB_ID=${jobId}`,
                `ENTRYPOINT=${entrypoint}`,
                `S3_JOBS_BUCKET=${s3JobsBucket}`,
                `S3_RESULTS_BUCKET=${s3ResultsBucket}`,
                `S3_ARCHIVES_BUCKET=${s3ArchivesBucket}`,
                `WEBHOOK_URL=${webhookUrl}`,
                `CSRF_TOKEN=${csrfToken}`,
            ];
            if (config.devMode) {
                env.push(`AWS_ACCESS_KEY_ID=${config.awsAccessKeyId}`);
                env.push(`AWS_SECRET_ACCESS_KEY=${config.awsSecretAccessKey}`);
                env.push(`AWS_DEFAULT_REGION=${config.awsRegion}`);
            } else {
                env.push('AWS_DEFAULT_REGION=us-east-2');
            }
            docker.createContainer({
                Image: image,
                AttachStdout: true,
                AttachStderr: true,
                Env: env,
            }, (err, container) => {
                if (ERR(err, callback)) return;
                callback(null, container);
            });
        },
        (container, callback) => {
            container.attach({
                stream: true,
                stdout: true,
                stderr: true,
            }, (err, stream) => {
                if (ERR(err, callback)) return;
                container.modem.demuxStream(stream, process.stdout, process.stderr);
                callback(null, container);
            });
        },
        (container, callback) => {
            container.start((err) => {
                if (ERR(err, callback)) return;
                callback(null, container);
            });
        },
        (container, callback) => {
            container.wait((err) => {
                if (ERR(err, callback)) return;
                callback(null, container);
            });
        },
        (container, callback) => {
            container.remove((err) => {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
    ], (err) => {
        if (ERR(err, callback)) return;
        callback(null);
    });
}
