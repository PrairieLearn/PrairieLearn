// @ts-check
const { assert } = require('chai');
const sinon = require('sinon');
const {
  ReceiveMessageCommand,
  ChangeMessageVisibilityCommand,
  DeleteMessageCommand,
} = require('@aws-sdk/client-sqs');

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

  const receiveMessage = sinon.spy(() => {
    if (callCount < timeoutCount) {
      callCount++;
      return {};
    }

    return {
      Messages: [
        {
          Body: JSON.stringify(message),
          ReceiptHandle: receiptHandle,
        },
      ],
    };
  });
  const changeMessageVisibility = sinon.spy(() => null);
  const deleteMessage = sinon.spy(() => null);

  const timeoutCount = options.timeoutCount || 0;
  let callCount = 0;

  return /** @type {any} */ ({
    send: async (command) => {
      if (command instanceof ReceiveMessageCommand) {
        return receiveMessage(command);
      } else if (command instanceof ChangeMessageVisibilityCommand) {
        return changeMessageVisibility(command);
      } else if (command instanceof DeleteMessageCommand) {
        return deleteMessage(command);
      } else {
        throw new Error(`Unknown command type: ${command.constructor.name}`);
      }
    },
    message,
    receiptHandle,
    changeMessageVisibility,
    receiveMessage,
    deleteMessage,
  });
}

const VISIBILITY_TIMEOUT = 60;

describe('queueReceiver', () => {
  beforeEach(() => {
    // Our config-loading system chokes when it's not running in AWS. Instead
    // of loading it, we'll just set the values we need for these tests.
    config.visibilityTimeout = VISIBILITY_TIMEOUT;
  });

  it('tries to receive a message from the correct queue url', (done) => {
    const sqs = fakeSqs();

    queueReceiver(
      sqs,
      'helloworld',
      (message, done) => done(),
      (err) => {
        assert.isNull(err);
        assert.equal(sqs.receiveMessage.args[0][0].input.QueueUrl, 'helloworld');
        done();
      },
    );
  });

  it('tries to fetch a message again if none is delivered', (done) => {
    const sqs = fakeSqs({
      timeoutCount: 1,
    });

    queueReceiver(
      sqs,
      'helloworld',
      (message, done) => done(),
      (err) => {
        assert.isNull(err);
        assert.equal(sqs.receiveMessage.callCount, 2);
        done();
      },
    );
  });

  it("rejects messages that don't contain a valid json string", (done) => {
    const sqs = fakeSqs({
      message: '{"oops, this is invalid json"',
    });

    queueReceiver(
      sqs,
      '',
      (message, done) => done(),
      (err) => {
        assert.isNotNull(err);
        assert.equal(sqs.deleteMessage.callCount, 0);
        done();
      },
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
      (message, done) => done(),
      (err) => {
        assert.isNotNull(err);
        assert.equal(sqs.deleteMessage.callCount, 0);
        done();
      },
    );
  });

  it('updates the timeout of received messages', (done) => {
    const sqs = fakeSqs();

    queueReceiver(
      sqs,
      '',
      (message, done) => done(),
      (err) => {
        assert.isNull(err);
        assert.equal(sqs.changeMessageVisibility.callCount, 1);
        const params = sqs.changeMessageVisibility.args[0][0].input;
        assert.equal(params.VisibilityTimeout, VISIBILITY_TIMEOUT);
        done();
      },
    );
  });

  it("doesn't delete messages that aren't handled successfully", (done) => {
    const sqs = fakeSqs();

    queueReceiver(
      sqs,
      '',
      (message, done) => done(new Error('RIP')),
      (err) => {
        assert.isNotNull(err);
        assert.equal(sqs.deleteMessage.callCount, 0);
        done();
      },
    );
  });

  it('deletes messages that are handled successfully', (done) => {
    const sqs = fakeSqs();

    queueReceiver(
      sqs,
      'goodbyeworld',
      (message, done) => done(),
      (err) => {
        assert.isNull(err);
        assert.equal(sqs.deleteMessage.callCount, 1);
        assert.equal(sqs.deleteMessage.args[0][0].input.QueueUrl, 'goodbyeworld');
        assert.equal(sqs.deleteMessage.args[0][0].input.ReceiptHandle, sqs.receiptHandle);
        done();
      },
    );
  });
});
