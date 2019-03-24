var ERR = require('async-stacktrace');
const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

module.exports = {};

module.exports.run = function(callback) {
    sqldb.query(sql.all, [], function(err) {
        if (ERR(err, callback)) return;
        callback(null);
    });
};
