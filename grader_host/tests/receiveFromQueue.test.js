/* eslint-env jest */
const queueReceiver = require('../lib/receiveFromQueue');

function randomString() {
    return Math.random().toString(36).slice(2);
}

function fakeSqs(options = {}) {
    const receiptHandle = randomString();

    let message = options.message;
    if (!message) {
        message = {
            jobId: randomString(),
            image: randomString(),
            entrypoint: randomString(),
            s3JobsBucket: randomString(),
            s3ResultsBucket: randomString(),
            s3ArchivesBucket: randomString()
        };
    }

    const timeoutCount = options.timeoutCount || 0;
    let callCount = 0;
    return {
        receiveMessage: jest.fn((params, callback) => {
            if (callCount < timeoutCount) {
                callCount++;
                return callback(null, {});
            }
            callback(null, {
                Messages: [
                    {
                        Body: JSON.stringify(message),
                        ReceiptHandle: receiptHandle
                    }
                ]
            });
        }),
        deleteMessage: jest.fn((params, callback) => callback(null)),
        message,
        receiptHandle
    };
}

describe('queueReceiver', () => {
    it('tries to receive a message from the correct queue url', (done) => {
        const sqs = fakeSqs();

        queueReceiver(sqs, 'helloworld', (message, errCb, successCb) => successCb(), (err) => {
            expect(err).toBeNull();
            expect(sqs.receiveMessage.mock.calls[0][0].QueueUrl).toBe('helloworld');
            done();
        });
    });

    it('tries to fetch a message again if none is delivered', (done) => {
        const sqs = fakeSqs({
            timeoutCount: 1
        });

        queueReceiver(sqs, 'helloworld', (message, errCb, successCb) => successCb(), (err) => {
            expect(err).toBeNull();
            expect(sqs.receiveMessage.mock.calls.length).toBe(2);
            done();
        });
    });

    it('rejects messages that aren\'t contain a valid json string', (done) => {
        const sqs = fakeSqs({
            message: '{"oops, this is invalid json"'
        });

        queueReceiver(sqs, '', (message, errCb, successCb) => successCb(), (err) => {
            expect(err).not.toBeNull();
            expect(sqs.deleteMessage.mock.calls.length).toBe(0);
            done();
        });
    });

    it('rejects messages that don\'t match the message schema', (done) => {
        const sqs = fakeSqs({
            message: {
                timeout: 'abc',
                s3ArchivesBucket: 123
            }
        });

        queueReceiver(sqs, '', (message, errCb, successCb) => successCb(), (err) => {
            expect(err).not.toBeNull();
            expect(sqs.deleteMessage.mock.calls.length).toBe(0);
            done();
        });
    });

    it('doesn\'t delete messages that aren\'t handled successfully', (done) => {
        const sqs = fakeSqs();

        queueReceiver(sqs, '', (message, errCb, _successCb) => errCb(new Error('RIP')), (err) => {
            expect(err).not.toBeNull();
            expect(sqs.deleteMessage.mock.calls.length).toBe(0);
            done();
        });
    });

    it('deletes messages that are handled successfully', (done) => {
        const sqs = fakeSqs();

        queueReceiver(sqs, 'goodbyeworld', (message, errCb, successCb) => successCb(), (err) => {
            expect(err).toBeNull();
            expect(sqs.deleteMessage.mock.calls.length).toBe(1);
            expect(sqs.deleteMessage.mock.calls[0][0].QueueUrl).toBe('goodbyeworld');
            expect(sqs.deleteMessage.mock.calls[0][0].ReceiptHandle).toBe(sqs.receiptHandle);
            done();
        });
    });
});
