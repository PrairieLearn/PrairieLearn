var ERR = require('async-stacktrace');
var sqldb = require('@prairielearn/prairielib/sql-db');
var sqlLoader = require('@prairielearn/prairielib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

module.exports = function(req, res, next) {
    var params = {
        assessment_instance_id: res.locals.assessmentInstanceId ? res.locals.assessmentInstanceId : req.params.assessmentInstanceId,
        user_id: res.locals.user.user_id,
    };
    sqldb.queryOneRow(sql.all, params, function(err, result) {
        if (ERR(err, next)) return;
        res.locals.assessmentInstance = result.rows[0];
        res.locals.assessmentId = res.locals.assessmentInstance.assessment_id;
        next();
    });
};
