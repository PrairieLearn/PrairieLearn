const ERR = require('async-stacktrace');

class SqsQueue {
    constructor(sqs, queueUrl) {
        this.sqs = sqs;
        this.queueUrl = queueUrl;
    }

    submitJob(message, callback) {
        const params = {
            QueueUrl: this.queueUrl,
            MessageBody: JSON.stringify(message),
        };
        this.sqs.sendMessage(params, (err) => {
            if (ERR(err, callback)) return;
            callback(null);
        });

    }
}

module.exports = SqsQueue;
