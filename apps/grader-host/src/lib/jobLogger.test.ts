import { assert } from 'chai';

import { BufferedWritableStream } from './jobLogger';

describe('BufferedWritableStream', () => {
  it('buffers bytes', () => {
    const stream = new BufferedWritableStream();

    stream.write('hello');
    stream.write(', world');

    const buffer = stream.getBuffer();
    assert.equal(buffer.toString(), 'hello, world');
  });

  it('truncates a buffer if max size is exceeded', () => {
    const stream = new BufferedWritableStream({ maxBuffer: 10 });

    stream.write('hello, world!');

    const buffer = stream.getBuffer();
    assert.equal(buffer.length, 10);
    assert.equal(buffer.toString(), 'hello, wor');
  });

  it('handles multiple buffers exceeding the max size', () => {
    const stream = new BufferedWritableStream({ maxBuffer: 10 });

    stream.write('hello');
    stream.write(', world');
    stream.write(', again');

    const buffer = stream.getBuffer();
    assert.equal(buffer.length, 10);
    assert.equal(buffer.toString(), 'hello, wor');
  });
});
