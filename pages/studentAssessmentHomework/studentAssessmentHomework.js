var ERR = require('async-stacktrace');
var _ = require('lodash');
var path = require('path');
var csvStringify = require('csv').stringify;
var express = require('express');
var router = express.Router();

var logger = require('../../lib/logger');
var error = require('../../lib/error');
var sqldb = require('../../lib/sqldb');
var sqlLoader = require('../../lib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

function makeAssessmentInstance(req, res, callback) {
    var params = [
        res.locals.assessment.id,
        res.locals.user.user_id,
        res.locals.authn_user.user_id,
        res.locals.authz_data.mode,
    ];
    sqldb.callOneRow('assessment_instances_insert', params, function(err, result) {
        if (ERR(err, callback)) return;
        callback(null, result.rows[0].assessment_instance_id);
    });
};

router.get('/', function(req, res, next) {
    if (res.locals.assessment.type !== 'Homework') return next();
    if (res.locals.assessment.multiple_instance) {
        return next(error.makeWithData('"Homework" assessments do not support multiple instances',
                                       {assessment: res.locals.assessment}));
    }
    var params = {
        assessment_id: res.locals.assessment.id,
        user_id: res.locals.user.user_id,
    };
    sqldb.query(sql.find_single_assessment_instance, params, function(err, result) {
        if (ERR(err, next)) return;
        if (result.rowCount == 0) {
            makeAssessmentInstance(req, res, function(err, assessment_instance_id) {
                if (ERR(err, next)) return;
                res.redirect(res.locals.urlPrefix + '/assessment_instance/' + assessment_instance_id);
            });
        } else {
            res.redirect(res.locals.urlPrefix + '/assessment_instance/' + result.rows[0].id);
        }
    });
});

module.exports = router;
