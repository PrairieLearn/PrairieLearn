var ERR = require('async-stacktrace');

var sqldb = ../prairielib/sql-db');
var sqlLoader = ../prairielib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

module.exports = {};

module.exports.run = function(callback) {
    sqldb.query(sql.all, [], function(err) {
        if (ERR(err, callback)) return;
        callback(null);
    });
};
