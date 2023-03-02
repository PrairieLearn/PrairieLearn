const csvStringify = require('../lib/nonblocking-csv-stringify');

/**
 * Example:
 *
 * ```
 * const rows = [
 *   { col1: 50, col2: 'X' },
 *   { col1: 70, col2: 'Y' },
 * ];
 * const columns = [
 *   ['Column 1', 'col1'],
 *   ['Column 2', 'col2'],
 * ];
 * rowsToCsv(rows, columns).pipe(res);
 * ```
 *
 * That will produce the following CSV:
 *
 * ```
 * Column 1,Column 2
 * 50,X
 * 70,Y
 * ```
 *
 * @param {any[]} rows
 * @param {[string, string][]} columns
 * @returns {import('csv-stringify').Stringifier}
 */
module.exports.rowsToCsv = function (rows, columns) {
  const headers = columns.map((c) => c[0]);
  const properties = columns.map((c) => c[1]);
  const data = rows.map((row) => properties.map((p) => (p == null ? '' : row[p])));
  data.splice(0, 0, headers);
  return csvStringify(data);
};

/**
 * Example:
 *
 * ```
 * const result = {columns: ['a', 'b'], rows: [{a: 1, b: 2}, {a: 5, b: 6}]};
 * resultToCsv(result).pipe(res);
 * ```
 *
 * @param {import('pg').QueryResult} result
 * @returns {import('csv-stringify').Stringifier}
 */
module.exports.resultToCsv = function (result) {
  const columns = result.columns.map((c) => [c, c]);
  return module.exports.rowsToCsv(result.rows, columns);
};
