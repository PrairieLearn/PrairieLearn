var ERR = require('async-stacktrace');
var _ = require('lodash');
var path = require('path');
var csvStringify = require('csv').stringify;
var express = require('express');
var router = express.Router();

var logger = require('../../logger');
var error = require('../../error');
var sqldb = require('../../sqldb');
var sqlLoader = require('../../sql-loader');

var sql = sqlLoader.load(path.join(__dirname, 'userAssessmentHomework.sql'));

function makeAssessmentInstance(req, res, callback) {
    var params = {
        assessment_id: res.locals.assessment.id,
        user_id: res.locals.user.id,
    };
    sqldb.queryOneRow(sql.new_assessment_instance, params, function(err, result) {
        if (ERR(err, callback)) return;
        callback(null, result.rows[0].id);
    });
};

router.get('/', function(req, res, next) {
    if (res.locals.assessment.type !== 'Homework' && res.locals.assessment.type !== 'Game') return next(); // FIXME: hack to handle 'Game'
    if (res.locals.assessment.multiple_instance) {
        return next(error.makeWithData('"Homework" assessments do not support multiple instances',
                                       {assessment: res.locals.assessment}));
    }
    var params = {
        assessment_id: res.locals.assessment.id,
        user_id: res.locals.user.id,
    };
    sqldb.query(sql.find_single_assessment_instance, params, function(err, result) {
        if (ERR(err, next)) return;
        if (result.rowCount == 0) {
            makeAssessmentInstance(req, res, function(err, assessmentInstanceId) {
                if (ERR(err, next)) return;
                res.redirect(res.locals.urlPrefix + '/assessmentInstance/' + assessmentInstanceId);
            });
        } else {
            res.redirect(res.locals.urlPrefix + '/assessmentInstance/' + result.rows[0].id);
        }
    });
});

module.exports = router;
