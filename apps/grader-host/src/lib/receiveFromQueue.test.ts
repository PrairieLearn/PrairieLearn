import {
  ReceiveMessageCommand,
  ChangeMessageVisibilityCommand,
  DeleteMessageCommand,
} from '@aws-sdk/client-sqs';
import { assert, use as chaiUse } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import sinon from 'sinon';

import { config } from './config.js';
import { receiveFromQueue } from './receiveFromQueue.js';

chaiUse(chaiAsPromised);

function randomString() {
  return Math.random().toString(36).slice(2);
}

function fakeSqs(options: { message?: any; timeoutCount?: number } = {}) {
  const receiptHandle = randomString();

  let message = options.message;
  if (!message) {
    message = {
      jobId: randomString(),
      image: randomString(),
      entrypoint: randomString(),
      timeout: 60,
      enableNetworking: true,
      environment: { FOO: 'bar' },
      s3Bucket: randomString(),
      s3RootKey: randomString(),
    };
  }

  const receiveMessage = sinon.spy((_command) => {
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
  const changeMessageVisibility = sinon.spy((_command) => null);
  const deleteMessage = sinon.spy((_command) => null);

  const timeoutCount = options.timeoutCount || 0;
  let callCount = 0;

  return {
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
  } as any;
}

const VISIBILITY_TIMEOUT = 60;

describe('receiveFromQueue', () => {
  beforeEach(() => {
    // Our config-loading system chokes when it's not running in AWS. Instead
    // of loading it, we'll just set the values we need for these tests.
    config.visibilityTimeout = VISIBILITY_TIMEOUT;
  });

  it('tries to receive a message from the correct queue url', async () => {
    const sqs = fakeSqs();

    await receiveFromQueue(sqs, 'helloworld', async () => {});

    assert.equal(sqs.receiveMessage.args[0][0].input.QueueUrl, 'helloworld');
  });

  it('tries to fetch a message again if none is delivered', async () => {
    const sqs = fakeSqs({
      timeoutCount: 1,
    });

    await receiveFromQueue(sqs, 'helloworld', async () => {});

    assert.equal(sqs.receiveMessage.callCount, 2);
  });

  it("rejects messages that don't contain a valid json string", async () => {
    const sqs = fakeSqs({
      message: '{"oops, this is invalid json"',
    });

    await assert.isRejected(receiveFromQueue(sqs, '', async () => {}));
    assert.equal(sqs.deleteMessage.callCount, 0);
  });

  it("rejects messages that don't match the message schema", async () => {
    const sqs = fakeSqs({
      message: {
        timeout: 'abc',
        s3Bucket: 123,
      },
    });

    await assert.isRejected(receiveFromQueue(sqs, '', async () => {}));
    assert.equal(sqs.deleteMessage.callCount, 0);
  });

  it('updates the timeout of received messages', async () => {
    const sqs = fakeSqs();

    await receiveFromQueue(sqs, '', async () => {});

    assert.equal(sqs.changeMessageVisibility.callCount, 1);
    const params = sqs.changeMessageVisibility.args[0][0].input;
    assert.equal(params.VisibilityTimeout, VISIBILITY_TIMEOUT);
  });

  it("doesn't delete messages that aren't handled successfully", async () => {
    const sqs = fakeSqs();

    await assert.isRejected(
      receiveFromQueue(sqs, '', async () => {
        throw new Error('RIP');
      }),
    );
    assert.equal(sqs.deleteMessage.callCount, 0);
  });

  it('deletes messages that are handled successfully', async () => {
    const sqs = fakeSqs();

    await receiveFromQueue(sqs, 'goodbyeworld', async () => {});

    assert.equal(sqs.deleteMessage.callCount, 1);
    assert.equal(sqs.deleteMessage.args[0][0].input.QueueUrl, 'goodbyeworld');
    assert.equal(sqs.deleteMessage.args[0][0].input.ReceiptHandle, sqs.receiptHandle);
  });
});
