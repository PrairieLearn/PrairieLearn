import { Duplex, pipeline } from 'node:stream';

import { Stringifier, type Options as StringifierOptions, stringify } from 'csv-stringify';
import { type Handler as TransformHandler, transform } from 'stream-transform';

export { stringify, Stringifier };

export interface StringifyNonblockingOptions extends StringifierOptions {
  batchSize?: number;
}

/**
 * Streaming transform from an array of objects to a CSV that doesn't
 * block the event loop.
 */
export function stringifyNonblocking(
  data: any[],
  options: StringifyNonblockingOptions = {},
): Stringifier {
  const { batchSize = 100, ...stringifierOptions } = options;
  const stringifier = new Stringifier(stringifierOptions);

  process.nextTick(function () {
    let j = 0;

    function loop() {
      for (let i = 0; i < batchSize; i++) {
        if (stringifier.destroyed) return;
        if (j < data.length) {
          const ready = stringifier.write(data[j++]);
          if (!ready) {
            stringifier.once('drain', loop);
            return;
          }
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

interface StringifyOptions<T, U = any> extends Pick<StringifierOptions, 'columns' | 'header'> {
  transform?: TransformHandler<T, U>;
}

/**
 * Transforms an object stream into a CSV stream. Record queues and asynchronous
 * transformation concurrency are limited to one because records may be large.
 */
export function stringifyStream<T, U = any>(
  options: StringifyOptions<T, U> = {},
): NodeJS.ReadWriteStream {
  const { transform: _transform, ...stringifierOptions } = options;
  const stringifier = new Stringifier({ ...stringifierOptions, writableHighWaterMark: 1 });
  if (!_transform) return stringifier;

  const transformer = transform({ highWaterMark: 1, parallel: 1 }, _transform);
  // Native compose() adds an input queue whose high water mark cannot be configured.
  const stream = new Duplex({
    writableObjectMode: true,
    writableHighWaterMark: 1,
    read() {
      stringifier.resume();
    },
    write(record, encoding, callback) {
      transformer.write(record, encoding, callback);
    },
    final(callback) {
      transformer.end(callback);
    },
    destroy(error, callback) {
      transformer.destroy(error ?? undefined);
      stringifier.destroy(error ?? undefined);
      callback(error);
    },
  });

  stringifier.on('data', (chunk) => {
    if (!stream.push(chunk)) stringifier.pause();
  });
  stringifier.on('end', () => stream.push(null));
  stringifier.pause();
  pipeline(transformer, stringifier, (error) => {
    if (error) stream.destroy(error);
  });
  return stream;
}
