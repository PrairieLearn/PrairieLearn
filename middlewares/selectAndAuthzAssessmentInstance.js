var ERR = require('async-stacktrace');
var _ = require('lodash');

var sqldb = require('@prairielearn/prairielib/sql-db');
var sqlLoader = require('@prairielearn/prairielib/sql-loader');
var error = require('@prairielearn/prairielib/error');

var sql = sqlLoader.loadSqlEquiv(__filename);

module.exports = function(req, res, next) {
    var params = {
        assessment_instance_id: req.params.assessment_instance_id,
        course_instance_id: res.locals.course_instance.id,
        authz_data: res.locals.authz_data,
        req_date: res.locals.req_date,
    };
    sqldb.query(sql.get_groupwork, params, function(err, result) {
        if (ERR(err, next)) return;
        if (result.rowCount != 0) {
            sqldb.query(sql.select_and_auth_group, params, function(err, result) {
                if (ERR(err, next)) return;
                console.log(result);
                if (result.rowCount == 0) return next(error.make(403, 'Access denied'));
                for(i = 0 ; i < result.rowCount; i++){
                    _.assign(res.locals, result.rows[i]);
                }
                next();
            });
        }else {
            sqldb.queryZeroOrOneRow(sql.select_and_auth, params, function(err, result) {
                if (ERR(err, next)) return;
                if (result.rowCount == 0) return next(error.make(403, 'Access denied'));
                _.assign(res.locals, result.rows[0]);
                //console.log(result.rows[0]);
                next();
            });
        };
    });
};
