// @ts-check

const { Transform, pipeline } = require('node:stream');
const Stringifier = require('csv-stringify').Stringifier;

/**
 * Streaming transform from an array of objects to a CSV that doesn't
 * block the event loop.
 *
 * @param {any[]} data Array of objects to be transformed to CSV
 * @returns {import('csv-stringify').Stringifier}
 */
function nonblockingStringify(data) {
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

function stringify(transform) {
  const stringifier = new Stringifier({});
  if (!transform) {
    return stringifier;
  }

  const transformStream = new Transform({
    objectMode: true,
    transform(chunk, encoding, callback) {
      this.push(transform(chunk));
      callback();
    },
  });
  return pipeline([transformStream, stringifier]);
}

module.exports = nonblockingStringify;
