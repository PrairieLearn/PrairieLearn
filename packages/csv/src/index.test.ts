import { Readable, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { setImmediate } from 'node:timers/promises';

import { assert, describe, expect, it } from 'vitest';

import { stringifyNonblocking, stringifyStream } from './index.js';

function streamToString(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

describe('stringifyStream', () => {
  it('stringifies a stream of objects', async () => {
    const stream = Readable.from([
      { a: 1, b: 1 },
      { a: 2, b: 2 },
      { a: 3, b: 3 },
    ]);
    const csvStream = stream.pipe(stringifyStream());
    const csv = await streamToString(csvStream);
    assert.equal(csv, '1,1\n2,2\n3,3\n');
  });

  it('stringifies a stream of arrays', async () => {
    const stream = Readable.from([
      ['1', '1'],
      ['2', '2'],
      ['3', '3'],
    ]);
    const csvStream = stream.pipe(stringifyStream());
    const csv = await streamToString(csvStream);
    assert.equal(csv, '1,1\n2,2\n3,3\n');
  });

  it('stringifies a stream with a transform', async () => {
    const stream = Readable.from([
      { a: 1, b: 1 },
      { a: 2, b: 2 },
      { a: 3, b: 3 },
    ]);
    const csvStream = stream.pipe(
      stringifyStream<{ a: number; b: number }>({
        transform: (row) => [row.a + 1, row.b + 2],
      }),
    );
    const csv = await streamToString(csvStream);
    assert.equal(csv, '2,3\n3,4\n4,5\n');
  });

  it('stringifies a stream with keyed columns and a transform', async () => {
    const stream = Readable.from([
      { a: 1, b: 1 },
      { a: 2, b: 2 },
      { a: 3, b: 3 },
    ]);
    const stringifier = stringifyStream<{ a: number; b: number }>({
      header: true,
      columns: [
        { key: 'a', header: 'first' },
        { key: 'b', header: 'second' },
      ],
      transform: (row) => [row.a + 1, row.b + 2],
    });
    const csv = await streamToString(stream.pipe(stringifier));
    assert.equal(csv, 'first,second\n2,3\n3,4\n4,5\n');
  });

  it('stringifies a stream with named columns and a transform', async () => {
    const stream = Readable.from([
      { a: 1, b: 1 },
      { a: 2, b: 2 },
      { a: 3, b: 3 },
    ]);
    const stringifier = stringifyStream<{ a: number; b: number }>({
      header: true,
      columns: ['first', 'second'],
      transform: (row) => [row.a + 1, row.b + 2],
    });
    const csv = await streamToString(stream.pipe(stringifier));
    assert.equal(csv, 'first,second\n2,3\n3,4\n4,5\n');
  });
});

describe('CSV backpressure', () => {
  it('bounds large async transformations and closes the source on cancellation', async () => {
    let produced = 0;
    let running = 0;
    let maxRunning = 0;
    let closed = false;
    const source = Readable.from(
      (async function* () {
        try {
          for (let i = 0; i < 32; i++) {
            produced++;
            yield { payload: 'x'.repeat(128 * 1024) };
          }
        } finally {
          closed = true;
        }
      })(),
    );
    let resolveFirstWrite!: () => void;
    const firstWrite = new Promise<void>((resolve) => {
      resolveFirstWrite = resolve;
    });
    const destination = new Writable({
      write() {
        resolveFirstWrite();
      },
    });
    const completed = pipeline(
      source,
      stringifyStream<{ payload: string }>({
        async transform(record) {
          running++;
          maxRunning = Math.max(maxRunning, running);
          await setImmediate();
          running--;
          return [record.payload];
        },
      }),
      destination,
    );

    await firstWrite;
    await setImmediate();
    try {
      assert.isAtMost(produced, 8);
      assert.equal(maxRunning, 1);
    } finally {
      destination.destroy(new Error('Download cancelled'));
      await expect(completed).rejects.toThrow('Download cancelled');
    }
    assert.isTrue(closed);
  });

  it('propagates transformation errors through the CSV stream', async () => {
    await expect(
      pipeline(
        Readable.from([{ value: 1 }]),
        stringifyStream({
          transform(_record) {
            throw new Error('Transformation failed');
          },
        }),
        new Writable({
          write(_chunk, _encoding, callback) {
            callback();
          },
        }),
      ),
    ).rejects.toThrow('Transformation failed');
  });

  it('pauses array stringification under backpressure and resumes when output drains', async () => {
    const rows = Array.from({ length: 64 }, () => ['x'.repeat(128 * 1024)]);
    const source = stringifyNonblocking(rows);
    let written = 0;
    let first = true;
    let unblock!: () => void;
    let resolveFirstWrite!: () => void;
    const firstWrite = new Promise<void>((resolve) => {
      resolveFirstWrite = resolve;
    });
    const destination = new Writable({
      write(chunk, _encoding, callback) {
        written += chunk.length;
        if (first) {
          first = false;
          unblock = callback;
          resolveFirstWrite();
        } else {
          callback();
        }
      },
    });
    const completed = pipeline(source, destination);

    await firstWrite;
    await setImmediate();
    try {
      assert.isAtMost(source.writableLength, source.writableHighWaterMark);
    } finally {
      unblock();
      await completed;
    }
    assert.equal(written, rows.length * (128 * 1024 + 1));
  });
});
