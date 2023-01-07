const ERR = require('async-stacktrace');
const _ = require('lodash');
const csvStringify = require('../lib/nonblocking-csv-stringify');
const { nonblockingStringifyAsync } = require('../lib/nonblocking-csv-stringify');

module.exports = {};

function computeData(rows, columns) {
  var headers = _.map(columns, (c) => c[0]);
  var properties = _.map(columns, (c) => c[1]);
  var data = _.map(rows, (row) => _.map(properties, (p) => (p == null ? '' : row[p])));
  data.splice(0, 0, headers);
  return data;
}

/*
  Example:

  var rows = [
      {col1: 50, col2: 'X'},
      {col1: 70, col2: 'Y'},
  ];
  var columns = [
      ['Column 1', 'col1'],
      ['Column 2', 'col2'],
  ];
  rowsToCsv(rows, columns, function(err, chunk) {
      ...
  });

  where chunk is some number of rows of:

  Column 1,Column 2
  50,X
  70,Y

  which is returned as:

  'Column 1,Column 2\n50,X\n70,Y\n'
*/
module.exports.rowsToCsv = function (rows, columns, callback) {
  const data = computeData(rows, columns);
  csvStringify(data, function (err, chunk) {
    if (ERR(err, callback)) {
      return;
    } else if (chunk) {
      callback(null, chunk);
    } else {
      callback(null, null);
    }
  });
};

module.exports.rowsToCsvAsync = async function (rows, columns, callback) {
  const data = computeData(rows, columns);
  return nonblockingStringifyAsync(data, callback);
};

/*
  Example:

  const result = {columns: ['a', 'b'], rows: [{a: 1, b: 2}, {a: 5, b: 6}]};
  await resultToCsvAsync(result, (chunk) => { // do something with chunk });
*/
module.exports.resultToCsv = function (result, callback) {
  const columns = _.map(result.columns, (c) => [c, c]);
  module.exports.rowsToCsv(result.rows, columns, callback);
};

module.exports.resultToCsvAsync = async function (result, callback) {
  const columns = _.map(result.columns, (c) => [c, c]);
  return module.exports.rowsToCsvAsync(result.rows, columns, callback);
};
