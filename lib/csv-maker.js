var ERR = require('async-stacktrace');
var _ = require('lodash');
var csvStringify = require('../lib/nonblocking-csv-stringify');

module.exports = {};

/*
  Example: call it like:

  rows = [
      {col1: 50, col2: 'X'},
      {col1: 70, col2: 'Y'},
  ];
  var columns = [
      ['Column 1', 'col1'],
      ['Column 2', 'col2'],
  ];
  rowsToCsv(rows, headers, properties, function(err, csv) {
      ...
  });

  to produce:

  Column 1,Column 2
  50,X
  70,Y

  which is returned as:

  csv = 'Column 1,Column 2\n50,X\n70,Y\n'
*/
module.exports.rowsToCsv = function(rows, columns, callback) {
    var headers = _.map(columns, c => c[0]);
    var properties = _.map(columns, c => c[1]);
    var data = _.map(rows, row => _.map(properties, p => (p == null) ? '' : row[p]));
    data.splice(0, 0, headers);
    csvStringify(data, function(err, csv) {
        if (ERR(err, callback)) return;
        callback(null, csv);
    });
};
