const AWS = require('aws-sdk');
const amqp = require('amqplib');

const config = require('./config');
const logger = require('./logger');
const SqsQueue = require('./externalGradingQueueSqs');
const RabbitMqQueue = require('./externalGradingQueueRabbitMq');

function initSqs() {
    this.sqs = new AWS.SQS();
    const queueName = config.externalGradingQueueName;

    return new Promise((resolve, reject) => {
        const params = {
            QueueName: queueName,
        };
        this.sqs.getQueueUrl(params, (err, data) => {
            if (err) {
                logger.error(`Unable to load url for queue "${queueName}"`);
                reject(err);
            }
            this.queueUrl = data.QueueUrl;
            resolve();
        });
    });
}

async function initRabbitMq() {
    this.conn = null;
    let retryCount = 0;
    let retryTimeouts = [500, 1000, 2000, 5000, 10000];
    return new Promise((resolve, reject) => {
        async function tryConnect() {
            try {
                this.conn = await amqp.connect(config.rabbitMqHost);
                resolve();
                this.conn.on('error', (err) => {
                    logger.error(err);
                    logger.error('Attempting to reconnect to RabbitMQ');
                    setTimeout(tryConnect, 1000);
                });
                this.conn.on('close', () => {
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
                    await initRabbitMq();
                    queue = new RabbitMqQueue(config.externalGradingQueueName);
                    await queue.init(this.conn);
                    break;
                case 'sqs':
                    await initSqs(callback);
                    queue = new SqsQueue(this.sqs, this.queueUrl);
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
