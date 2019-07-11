var ERR = require('async-stacktrace');

var sqldb = require('@prairielearn/prairielib/sql-db');
var sqlLoader = require('@prairielearn/prairielib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

module.exports = function(req, res, next) {
    var params = {
        course_id: res.locals.course.id,
    };
    sqldb.queryOneRow(sql.select_open_issue_count, params, function(err, result) {
        if (ERR(err, next)) return;
        res.locals.navbarOpenIssueCount = result.rows[0].count;
        next();
    });
};
