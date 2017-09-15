const fs = require('fs');
const async = require('async');
const ERR = require('async-stacktrace');
const Docker = require('dockerode');
const AWS = require('aws-sdk');

let DEV_MODE, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION;

if (fs.existsSync('./aws-config.json')) {
    DEV_MODE = true;
    AWS.config.loadFromPath('./aws-config.json');
    awsConfig = JSON.parse(fs.readFileSync('./aws-config.json'));
    AWS_ACCESS_KEY_ID = awsConfig.accessKeyId;
    AWS_SECRET_ACCESS_KEY = awsConfig.secretAccessKey;
    AWS_REGION = awsConfig.region;
} else {
    DEV_MODE = false;
    console.log('Missing aws-config.json; this shouldn\'t matter when running in production');
    AWS.config.update({region: 'us-east-2'});
}

const sqs = new AWS.SQS();

const QUEUE_NAME = process.env.QUEUE_NAME || 'grading';
let QUEUE_URL = process.env.QUEUE_URL;
if (!QUEUE_URL) {
    const params = {
        QueueName: QUEUE_NAME
    };
    sqs.getQueueUrl(params, (err, data) => {
        if (err) {
            console.error(`Unable to fetch url for queue "${QUEUE_NAME}"`);
            console.error(err);
            process.exit(1);
        }
        QUEUE_URL = data.QueueUrl;
        receiveAndHandleMessage();
    })
} else {
    // Immediately start pulling from the QueueUrl
    receiveAndHandleMessage();
}

function receiveAndHandleMessage() {
    const params = {
        MaxNumberOfMessages: 1,
        QueueUrl: QUEUE_URL,
        WaitTimeSeconds: 20
    }
    console.log('Waiting for message...');
    sqs.receiveMessage(params, (err, data) => {
        if (err) {
            console.error(err);
        } else {
            if (!data.Messages) {
                console.log('Request timed out! Retrying...');
                receiveAndHandleMessage();
            } else {

                var deleteParams = {
                    QueueUrl: QUEUE_URL,
                    ReceiptHandle: data.Messages[0].ReceiptHandle
                };
                sqs.deleteMessage(deleteParams, (err) => {
                    if (err) {
                        console.log(`Error deleting message with receipt token ${data.Messages[0].ReceiptHandle}`)
                    }
                    console.log(data);
                    try {
                        const messageBody = data.Messages[0].Body;//.replace(/\//g, '\\/');
                        console.log(messageBody);
                        const parsedBody = JSON.parse(messageBody);
                        handleMessage(parsedBody, (err) => {
                            ERR(err, (err) => console.error(err));
                            receiveAndHandleMessage();
                        });
                    } catch (e) {
                        console.error(e);
                        receiveAndHandleMessage();
                    }
                });
            }
        }
    })
}

function handleMessage(messageBody, callback) {
    console.log(messageBody);
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
                    console.warn(`Error pulling "${image}" image; attempting to fall back to cached version.`);
                    console.warn(err);
                }

                docker.modem.followProgress(stream, (err) => {
                    if (ERR(err, callback)) return;
                    callback(null);
                }, (output) => {
                    console.info(output);
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
            if (DEV_MODE) {
                env.push(`AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}`);
                env.push(`AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}`);
                env.push(`AWS_DEFAULT_REGION=${AWS_REGION}`);
            }
            console.log(env);
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
        (callback) => {
            console.log('We\'re done, yay!');
            callback();
        },
    ], (err) => {
        if (ERR(err, callback)) return;
        callback(null);
    });
}
