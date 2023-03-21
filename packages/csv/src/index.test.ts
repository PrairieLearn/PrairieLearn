import { Readable } from 'node:stream';
import { assert } from 'chai';

import { stringify } from './index';

function streamToString(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

describe('stringify', () => {
  it('stringifies a stream of objects', async () => {
    const stream = Readable.from([
      { a: 1, b: 1 },
      { a: 2, b: 2 },
      { a: 3, b: 3 },
    ]);
    const csvStream = stream.pipe(stringify());
    const csv = await streamToString(csvStream);
    assert.equal(csv, '1,1\n2,2\n3,3\n');
  });

  it('stringifies a stream of arrays', async () => {
    const stream = Readable.from([
      ['1', '1'],
      ['2', '2'],
      ['3', '3'],
    ]);
    const csvStream = stream.pipe(stringify());
    const csv = await streamToString(csvStream);
    assert.equal(csv, '1,1\n2,2\n3,3\n');
  });

  it('stringifies a stream with a transform', async () => {
    const stream = Readable.from([
      { a: 1, b: 1 },
      { a: 2, b: 2 },
      { a: 3, b: 3 },
    ]);
    const csvStream = stream.pipe(stringify({ transform: (row) => [row.a + 1, row.b + 2] }));
    const csv = await streamToString(csvStream);
    assert.equal(csv, '2,3\n3,4\n4,5\n');
  });
});
