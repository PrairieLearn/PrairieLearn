import { Stringifier, Options as StringifierOptions } from 'csv-stringify';
import { transform, Handler as TransformHandler } from 'stream-transform';
import multipipe from 'multipipe';

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

interface StringifyOptions<T = any, U = any>
  extends Pick<StringifierOptions, 'columns' | 'header'> {
  transform?: TransformHandler<T, U>;
}

export function stringify<T = any, U = any>(
  options: StringifyOptions<T, U> = {}
): NodeJS.ReadWriteStream {
  const { transform: _transform, ...stringifierOptions } = options;
  const stringifier = new Stringifier(stringifierOptions);
  if (!_transform) return stringifier;
  // TODO: use native `node:stream#compose` once it's stable.
  return multipipe(transform(_transform), stringifier);
}
