import { Transform, pipeline } from 'node:stream';
import { Stringifier } from 'csv-stringify';

/**
 * Streaming transform from an array of objects to a CSV that doesn't
 * block the event loop.
 */
export function nonblockingStringify(data: any[]): Stringifier {
  const stringifier = new Stringifier({});

  process.nextTick(function () {
    let j = 0;
    function loop() {
      for (let i = 0; i < 10; i++) {
        if (j < data.length) {
          stringifier.write(data[j]);
          j += 1;
        } else {
          stringifier.end();
          return;
        }
      }
      setImmediate(loop);
    }
    loop();
  });

  return stringifier;
}

type TransformFunction<T, U> = (chunk: T) => U;

export function stringify<T = any, U = any>(transform?: TransformFunction<T, U>): Stringifier {
  const stringifier = new Stringifier({});
  if (!transform) {
    return stringifier;
  }

  const transformStream = new Transform({
    objectMode: true,
    transform(chunk, _encoding, callback) {
      this.push(transform(chunk));
      callback();
    },
  });
  return pipeline(transformStream, stringifier);
}
