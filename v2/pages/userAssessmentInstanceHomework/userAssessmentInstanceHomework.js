var ERR = require('async-stacktrace');
var _ = require('lodash');
var path = require('path');
var csvStringify = require('csv').stringify;
var express = require('express');
var router = express.Router();

var logger = require('../../lib/logger');
var sqldb = require('../../lib/sqldb');
var sqlLoader = require('../../lib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

router.get('/', function(req, res, next) {
    if (res.locals.assessment.type !== 'Homework') return next();
    var params = {
        assessment_instance_id: res.locals.assessment_instance.id,
        assessment_id: res.locals.assessment.id,
    };
    sqldb.query(sql.update, params, function(err, result) {
        if (ERR(err, next)) return;

        var params = {assessment_instance_id: res.locals.assessment_instance.id};
        sqldb.query(sql.get_questions, params, function(err, result) {
            if (ERR(err, next)) return;
            res.locals.questions = result.rows;

            res.render(path.join(__dirname, 'userAssessmentInstanceHomework'), res.locals);
        });
    });
});

module.exports = router;
