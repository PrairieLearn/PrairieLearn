const ERR = require('async-stacktrace');
const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));

const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');

const sql = sqlLoader.loadSqlEquiv(__filename);

module.exports = function(req, res, next) {
    var params = {
        user_id: res.locals.user.user_id,
        is_administrator: res.locals.is_administrator,
    };
    debug(params);

    sqldb.query(sql.select_courses, params, (err, result) => {
        if (ERR(err, next)) return;
        res.locals.courses = result.rows;
        next();
    });
};
