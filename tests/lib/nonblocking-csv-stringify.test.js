const { describe } = require('../../lib/databaseDescribe');

const assert = require('chai').assert;
const csvStringify = require('../../lib/nonblocking-csv-stringify');

/**
 * Run test: mocha tests/lib/nonblocking-csv-stringify.test.js
 */
describe('nonblocking-csv-stringify', () => {
  it('should stringify data to CSV format', () => {
    const data = [
      ['col1', 'col2', 'col3'],
      ['row1_v1', 'row1_v2', 'row1_v3'],
      ['row2_v1', 'row2_v2', 'row2_v3'],
      ['row3_v1', 'row3_v2', 'row3_v3'],
    ];

    const expected = "col1,col2,col3\nrow1_v1,row1_v2,row1_v3\nrow2_v1,row2_v2,row2_v3\nrow3_v1,row3_v2,row3_v3\n";

    const callback = (err, csv) => {
      if (err) return err;
      const actual = csv;
      assert.equal(actual, expected);
    };

    csvStringify(data, callback);
  });
});
