class RabbitMqQueue {
    constructor(name) {
        this.name = name;
    }

    async init(conn) {
        this.ch = await conn.createChannel();
    }

    submitJob(message, callback) {
        (async () => {
            try {
                await this.ch.assertQueue(this.name, { durable: true });
                this.ch.sendToQueue(this.name, new Buffer(JSON.stringify(message)), { persistent: true });
                callback(null);
            } catch (e) {
                callback(e);
            }

        })();
    }
}

module.exports = RabbitMqQueue;
