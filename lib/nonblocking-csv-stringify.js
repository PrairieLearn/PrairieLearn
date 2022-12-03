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
function nonblockingStringify(data, callback, options) {
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
  let chunks = [];
  stringifier.on('readable', function () {
    let chunk;
    while ((chunk = stringifier.read()) !== null) {
      chunks.push(chunk);
    }
  });
  stringifier.on('error', function (err) {
    return callback(err);
  });
  stringifier.on('end', function () {
    return callback(null, chunks.join(''));
  });
}

function nonblockingStringifyAsync(data, options) {
  return new Promise((resolve, reject) => {
    nonblockingStringify(
      data,
      (err, csv) => {
        if (err) return reject(err);
        return resolve(csv);
      },
      options
    );
  });
}

module.exports = nonblockingStringify;
module.exports.nonblockingStringifyAsync = nonblockingStringifyAsync;
