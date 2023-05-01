// @ts-check
const { assert } = require('chai');
const sinon = require('sinon');
const { config } = require('../lib/config');
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
      s3Bucket: randomString(),
      s3RootKey: randomString(),
    };
  }
  if (options.mergeMessage) {
    message = {
      ...message,
      ...options.mergeMessage,
    };
  }

  const timeoutCount = options.timeoutCount || 0;
  let callCount = 0;
  return {
    receiveMessage: sinon.spy((params, callback) => {
      if (callCount < timeoutCount) {
        callCount++;
        return callback(null, {});
      }
      callback(null, {
        Messages: [
          {
            Body: JSON.stringify(message),
            ReceiptHandle: receiptHandle,
          },
        ],
      });
    }),
    deleteMessage: sinon.spy((params, callback) => callback(null)),
    changeMessageVisibility: sinon.spy((params, callback) => callback(null)),
    message,
    receiptHandle,
  };
}

const TIMEOUT_OVERHEAD = 300;

describe('queueReceiver', () => {
  beforeEach(() => {
    // Our config-loading system chokes when it's not running in AWS. Instead
    // of loading it, we'll just set the values we need for these tests.
    config.timeoutOverhead = TIMEOUT_OVERHEAD;
  });

  it('tries to receive a message from the correct queue url', (done) => {
    const sqs = fakeSqs();

    queueReceiver(
      sqs,
      'helloworld',
      (message, errCb, successCb) => successCb(),
      (err) => {
        assert.isNull(err);
        assert.equal(sqs.receiveMessage.args[0][0].QueueUrl, 'helloworld');
        done();
      }
    );
  });

  it('tries to fetch a message again if none is delivered', (done) => {
    const sqs = fakeSqs({
      timeoutCount: 1,
    });

    queueReceiver(
      sqs,
      'helloworld',
      (message, errCb, successCb) => successCb(),
      (err) => {
        assert.isNull(err);
        assert.equal(sqs.receiveMessage.callCount, 2);
        done();
      }
    );
  });

  it("rejects messages that don't contain a valid json string", (done) => {
    const sqs = fakeSqs({
      message: '{"oops, this is invalid json"',
    });

    queueReceiver(
      sqs,
      '',
      (message, errCb, successCb) => successCb(),
      (err) => {
        assert.isNotNull(err);
        assert.equal(sqs.deleteMessage.callCount, 0);
        done();
      }
    );
  });

  it("rejects messages that don't match the message schema", (done) => {
    const sqs = fakeSqs({
      message: {
        timeout: 'abc',
        s3Bucket: 123,
      },
    });

    queueReceiver(
      sqs,
      '',
      (message, errCb, successCb) => successCb(),
      (err) => {
        assert.isNotNull(err);
        assert.equal(sqs.deleteMessage.callCount, 0);
        done();
      }
    );
  });

  it('updates the timeout of received messages', (done) => {
    const sqs = fakeSqs({
      mergeMessage: {
        timeout: 10,
      },
    });

    queueReceiver(
      sqs,
      '',
      (message, errCb, successCb) => successCb(),
      (err) => {
        assert.isNull(err);
        assert.equal(sqs.changeMessageVisibility.callCount, 1);
        const params = sqs.changeMessageVisibility.args[0][0];
        assert.equal(params.VisibilityTimeout, 10 + TIMEOUT_OVERHEAD);
        done();
      }
    );
  });

  it("doesn't delete messages that aren't handled successfully", (done) => {
    const sqs = fakeSqs();

    queueReceiver(
      sqs,
      '',
      (message, errCb, _successCb) => errCb(new Error('RIP')),
      (err) => {
        assert.isNotNull(err);
        assert.equal(sqs.deleteMessage.callCount, 0);
        done();
      }
    );
  });

  it('deletes messages that are handled successfully', (done) => {
    const sqs = fakeSqs();

    queueReceiver(
      sqs,
      'goodbyeworld',
      (message, errCb, successCb) => successCb(),
      (err) => {
        assert.isNull(err);
        assert.equal(sqs.deleteMessage.callCount, 1);
        assert.equal(sqs.deleteMessage.args[0][0].QueueUrl, 'goodbyeworld');
        assert.equal(sqs.deleteMessage.args[0][0].ReceiptHandle, sqs.receiptHandle);
        done();
      }
    );
  });
});
