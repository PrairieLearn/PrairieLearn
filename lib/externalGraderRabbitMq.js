const amqp = require('amqplib');

const config = require('./config');

let ch = null;

module.exports.init = function(callback) {
    (async () => {
        const conn = await amqp.connect(config.rabbitMqHost);
        ch = await conn.createChannel();
    })().then(() => callback(null)).catch(callback);
};

module.exports.sendToQueue = function(queueName, message, callback) {
    if (ch === null) {
        return callback(new Error('RabbitMQ connection was not initialized'));
    }
    (async () => {
        await ch.assertQueue(queueName, {durable: true});
        ch.sendToQueue(queueName, new Buffer(JSON.stringify(message)), {persistent: true});
    })().then(() => callback(null)).catch(callback);
};
