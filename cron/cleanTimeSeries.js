const ERR = require('async-stacktrace');

const logger = require('../lib/logger');
const sqldb = require('../prairielib/lib/sql-db');
const sqlLoader = require('../prairielib/lib/sql-loader');

const sql = sqlLoader.loadSqlEquiv(__filename);

module.exports.run = (callback) => {
  sqldb.query(sql.clean_time_series, {}, (err, result) => {
    if (ERR(err, callback)) return;
    logger.verbose(`Deleted ${result.rowCount} old rows from time_series table`);
    callback(null);
  });
};
