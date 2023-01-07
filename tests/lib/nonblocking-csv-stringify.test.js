const assert = require('chai').assert;
const csvStringify = require('../../lib/nonblocking-csv-stringify');
const { nonblockingStringifyAsync } = require('../../lib/nonblocking-csv-stringify');

describe('nonblocking-csv-stringify', async function () {
  const NUM_ROWS = 30;
  const generateTestData = (numRows = NUM_ROWS) => {
    let chunks = [];
    for (let i = 0; i < numRows; i++) {
      const chunk = [`row${i}_v1`, `row${i}_v2`, `row${i}_v3`];
      chunks.push(chunk);
    }
    return chunks;
  };

  const data = generateTestData();
  const EXPECTED_CSV_STRING = data.map((row) => row.join(',')).join('\n') + '\n';

  it('should stringify small data to CSV format callback-style', function () {
    let chunks = [];
    const callback = (err, chunk) => {
      if (err) {
        throw Error('Error formatting CSV', err);
      } else if (chunk) {
        chunks.push(chunk);
      } else {
        assert.equal(chunks.join(''), EXPECTED_CSV_STRING);
      }
    };
    csvStringify(data, callback);
  });

  it('should stringify small data to CSV format async', async function () {
    try {
      let chunks = [];
      await nonblockingStringifyAsync(data, (chunk) => {
        chunks.push(chunk);
      });
      assert.equal(chunks.join(''), EXPECTED_CSV_STRING);
    } catch (err) {
      throw Error('Error formatting CSV', err);
    }
  });
});
