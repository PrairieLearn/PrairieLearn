/**
 * @description
 * This module is to provide a CSV stringify function that does not block event
 * loop based on csv-stringify module.
 */

const Stringifier = require('csv-stringify').Stringifier;

/**
 * Nonblocking CSV stringify
 * @param {Array} data array of objects to be transformed to CSV
 * @param {function} callback callback accepting (csv, err)
 * @param {object} options options passed to Stringifier in module csv-stringify
 */
function nonblockingStringify(data, options) {
  let stringifier = new Stringifier(options);
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

module.exports = nonblockingStringify;
