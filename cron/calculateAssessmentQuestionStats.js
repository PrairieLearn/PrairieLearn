var ERR = require('async-stacktrace');

var sqldb = require('../lib/sqldb');
var sqlLoader = require('../lib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

module.exports = {};

module.exports.run = function(callback) {
    sqldb.query(sql.all, [], function(err) {
        if (ERR(err, callback)) return;
        callback(null);
    });
};
