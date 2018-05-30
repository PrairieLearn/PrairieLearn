const AWS = require('aws-sdk');
const amqp = require('amqplib');

const config = require('./config');
const logger = require('./logger');
const SqsQueue = require('./queue-sqs');
const RabbitMqQueue = require('./queue-rabbitmq');

function initSqs(sqs) {
    const queueName = config.externalGradingQueueName;

    return new Promise((resolve, reject) => {
        const params = {
            QueueName: queueName,
        };
        sqs.getQueueUrl(params, (err, data) => {
            if (err) {
                logger.error(`Unable to load url for queue "${queueName}"`);
                reject(err);
            }
            resolve(data.QueueUrl);
        });
    });
}

async function initRabbitMq() {
    let retryCount = 0;
    let retryTimeouts = [500, 1000, 2000, 5000, 10000];
    return new Promise((resolve, reject) => {
        async function tryConnect() {
            try {
                const conn = await amqp.connect(config.rabbitMqHost);
                resolve(conn);
                conn.on('error', (err) => {
                    logger.error(err);
                    logger.error('Attempting to reconnect to RabbitMQ');
                    setTimeout(tryConnect, 1000);
                });
                conn.on('close', () => {
                    logger.error('Lost connection to RabbitMQ, attempting to reconnect');
                    logger.error('Attempting to reconnect to RabbitMQ');
                    setTimeout(tryConnect, 1000);
                });
            } catch (e) {
                if (retryCount >= retryTimeouts.length) {
                    logger.error(`Couldn't connect to RabbitMQ after ${retryTimeouts.length} retries`);
                    reject(e);
                    return;
                }

                const timeout = retryTimeouts[retryCount];
                retryCount++;
                logger.error(`Couldn't connect to RabbitMQ, retrying in ${timeout}ms`);
                setTimeout(tryConnect, timeout);
            }
        }
        tryConnect();
    });
}

module.exports.create = function(callback) {
    (async () => {
        try {
            let queue;
            const type = config.externalGradingQueueType;
            switch(type) {
                case 'rabbitmq':
                    this.conn = await initRabbitMq();
                    queue = new RabbitMqQueue(config.externalGradingQueueName);
                    await queue.init(this.conn);
                    logger.info(`Created RabbitMq queue with name "${config.externalGradingQueueName}"`);
                    break;
                case 'sqs':
                    this.sqs = new AWS.SQS();
                    this.queueUrl = await initSqs(this.sqs);
                    queue = new SqsQueue(this.sqs, this.queueUrl);
                    logger.info(`Created SQS queue with url "${this.queueUrl}"`);
                    break;
                default:
                    callback(new Error(`Unknown queue type: ${type}`));
                    return;
            }
            callback(null, queue);
        } catch (e) {
            callback(e);
        }
    })();

};
