var ERR = require('async-stacktrace');
var _ = require('lodash');

var error = require('../lib/error');
var logger = require('../lib/logger');
var sqldb = require('../lib/sqldb');
var sqlLoader = require('../lib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

module.exports = function(req, res, next) {
    var params = {
        instance_question_id: req.params.instance_question_id,
        course_instance_id: res.locals.course_instance.id,
        authz_data: res.locals.authz_data,
    };
    sqldb.queryOneRow(sql.select_and_auth, params, function(err, result) {
        if (ERR(err, next)) return;
        _.assign(res.locals, result.rows[0]);

        console.log('################################################################################');
        console.log(res.locals.instance_question.status == res.locals.instance_question.check_status, res.locals.instance_question.id, res.locals.instance_question.status, res.locals.instance_question_info.check_status);
        
        next();
    });
};
