const assert = require('chai').assert;
const csvMaker = require('../../lib/csv-maker');

describe('csv-maker', async function () {
  const NUM_ROWS = 30;

  describe('rowsToCsv', async function () {
    const generateTestData = (numRows = NUM_ROWS) => {
      const columns = [
        ['Column 1', 'col1'],
        ['Column 2', 'col2'],
      ];

      let rows = [];
      for (let i = 0; i < numRows; i++) {
        let row = {};
        columns.forEach(([_header, col]) => (row = { ...row, [col]: `row${i}_${col}` }));
        rows.push(row);
      }

      return { rows, columns };
    };

    const { rows, columns } = generateTestData();
    const EXPECTED_CSV_STRING =
      columns.map(([header, _col]) => header).join(',') +
      '\n' +
      rows.map((row) => Object.values(row).join(',')).join('\n') +
      '\n';

    it('should stringify small number of columns and rows to CSV format callback-style', function () {
      let chunks = [];
      csvMaker.rowsToCsv(rows, columns, (err, chunk) => {
        if (err) {
          throw Error('Error formatting CSV', err);
        } else if (chunk) {
          chunks.push(chunk);
        } else {
          assert.equal(chunks.join(''), EXPECTED_CSV_STRING);
        }
      });
    });

    it('should stringify small number of columns and rows to CSV format async', async function () {
      try {
        let chunks = [];
        await csvMaker.rowsToCsvAsync(rows, columns, (chunk) => {
          chunks.push(chunk);
        });
        assert(chunks.join(''), EXPECTED_CSV_STRING);
      } catch (err) {
        throw Error('Error formatting CSV', err);
      }
    });
  });

  describe('resultToCsv', async function () {
    const generateTestData = (numRows = NUM_ROWS) => {
      const columns = ['col1', 'col2'];

      let rows = [];
      for (let i = 0; i < numRows; i++) {
        let row = {};
        columns.forEach((col) => (row = { ...row, [col]: `row${i}_${col}` }));
        rows.push(row);
      }

      return { rows, columns };
    };

    const result = generateTestData();
    const EXPECTED_CSV_STRING =
      result.columns.join(',') +
      '\n' +
      result.rows.map((row) => Object.values(row).join(',')).join('\n') +
      '\n';

    it('should stringify small result to CSV format callback-style', function () {
      let chunks = [];
      csvMaker.resultToCsv(result, (err, chunk) => {
        if (err) {
          throw Error('Error formatting CSV', err);
        } else if (chunk) {
          chunks.push(chunk);
        } else {
          assert.equal(chunks.join(''), EXPECTED_CSV_STRING);
        }
      });
    });

    it('should stringify small result to CSV format async', async function () {
      try {
        let chunks = [];
        await csvMaker.resultToCsvAsync(result, (chunk) => {
          chunks.push(chunk);
        });
        assert.equal(chunks.join(''), EXPECTED_CSV_STRING);
      } catch (err) {
        throw Error('Error formatting CSV', err);
      }
    });
  });
});
