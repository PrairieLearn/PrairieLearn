import { assert } from 'chai';

import { runWithEventBuffer, eventBuffer } from './index';

describe('eventBuffer', () => {
  it('discards events when run with empty async local storage', () => {
    eventBuffer.push('msg');

    const messages = eventBuffer.flush();
    assert.lengthOf(messages, 0);
  });
});

describe('runWithEventBuffer', () => {
  it('captures and flushes messages', async () => {
    let messages = [];

    await runWithEventBuffer(async () => {
      eventBuffer.push('msg', { foo: 'bar' });
      messages = eventBuffer.flush();
    });

    assert.lengthOf(messages, 1);
    assert.equal(messages[0].message, 'msg');
    assert.deepEqual(messages[0].data, { foo: 'bar' });
    assert.instanceOf(messages[0].timestamp, Date);
  });

  it('does not leak messages outside of thread of execution', () => {
    runWithEventBuffer(async () => {
      eventBuffer.push('msg');
    });

    let messages = eventBuffer.flush();

    assert.lengthOf(messages, 0);
  });

  it('isolates during nested execution', async () => {
    let messages = [];
    let nestedMessages = [];

    await runWithEventBuffer(async () => {
      eventBuffer.push('msg', { foo: 'bar' });

      await runWithEventBuffer(async () => {
        eventBuffer.push('nestedMsg', { bar: 'baz' });
        nestedMessages = eventBuffer.flush();
      });

      messages = eventBuffer.flush();
    });

    assert.lengthOf(messages, 1);
    assert.equal(messages[0].message, 'msg');
    assert.deepEqual(messages[0].data, { foo: 'bar' });
    assert.instanceOf(messages[0].timestamp, Date);

    assert.lengthOf(nestedMessages, 1);
    assert.equal(nestedMessages[0].message, 'nestedMsg');
    assert.deepEqual(nestedMessages[0].data, { bar: 'baz' });
    assert.instanceOf(nestedMessages[0].timestamp, Date);
  });
});
