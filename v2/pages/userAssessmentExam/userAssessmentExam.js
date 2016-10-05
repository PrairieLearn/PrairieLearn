var ERR = require('async-stacktrace');
var _ = require('lodash');
var async = require('async');
var path = require('path');
var csvStringify = require('csv').stringify;
var express = require('express');
var router = express.Router();

var logger = require('../../lib/logger');
var error = require('../../lib/error');
var questionServers = require('../../question-servers');
var sqldb = require('../../lib/sqldb');
var sqlLoader = require('../../lib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

function makeAssessmentInstance(req, res, callback) {
    sqldb.beginTransaction(function(err, client, done) {
        if (ERR(err, callback)) return;
    
        var assessmentInstanceId, workList;
        async.series([
            function(callback) {
                var params = {
                    assessment_id: res.locals.assessment.id,
                    user_id: res.locals.user.id,
                    mode: req.mode,
                };
                sqldb.queryWithClientOneRow(client, sql.make_assessment_instance, params, function(err, result) {
                    if (ERR(err, callback)) return;
                    assessmentInstanceId = result.rows[0].id;
                    callback(null);
                });
            },
            function(callback) {
                var params = {
                    assessment_id: res.locals.assessment.id,
                };
                sqldb.queryWithClient(client, sql.get_work_list, params, function(err, result) {
                    if (ERR(err, callback)) return;
                    workList = result.rows;
                    callback(null);
                });
            },
            function(callback) {
                async.each(workList, function(workItem, callback) {
                    var params = {
                        assessment_question_id: workItem.assessment_question_id,
                        assessment_instance_id: assessmentInstanceId,
                    };
                    sqldb.queryWithClientOneRow(client, sql.make_instance_question, params, function(err, result) {
                        if (ERR(err, callback)) return;
                        // FIXME: returning with error here triggers "Can't set headers" exception
                        var instanceQuestionId = result.rows[0].id;
                        questionServers.makeVariant(workItem.question, res.locals.course, {}, function(err, variant) {
                            if (ERR(err, callback)) return;
                            var params = {
                                instance_question_id: instanceQuestionId,
                                variant_seed: variant.vid,
                                question_params: variant.params,
                                true_answer: variant.true_answer,
                                options: variant.options,
                            };
                            sqldb.queryWithClientOneRow(client, sql.make_variant, params, function(err, result) {
                                if (ERR(err, callback)) return;
                                callback(null);
                            });
                        });
                    });
                }, function(err) {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
            function(callback) {
                var params = {assessment_instance_id: assessmentInstanceId};
                sqldb.queryWithClient(client, sql.set_max_points, params, function(err) {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
        ], function(err) {
            sqldb.endTransaction(client, done, err, function(err) {
                if (ERR(err, callback)) return;
                callback(null, assessmentInstanceId);
            });
        });
    });
};

router.get('/', function(req, res, next) {
    if (res.locals.assessment.type !== 'Exam') return next();
    if (res.locals.assessment.multiple_instance) {
        if (_(req.query).has('confirm') && req.query.confirm == 'yes') {
            if (!res.locals.authz_result.authorized_edit) return next(error.make(403, 'Not authorized', res.locals));
            makeAssessmentInstance(req, res, function(err, assessmentInstanceId) {
                if (ERR(err, next)) return;
                res.redirect(res.locals.urlPrefix + '/assessment_instance/' + assessmentInstanceId);
            });
        } else {
            res.render(path.join(__dirname, 'userAssessmentExam'), res.locals);
        }
    } else {
        var params = {
            assessment_id: res.locals.assessment.id,
            user_id: res.locals.user.id,
        };
        sqldb.query(sql.get_single_assessment_instance, params, function(err, result) {
            if (ERR(err, next)) return;
            if (result.rowCount == 0) {
                if (_(req.query).has('confirm') && req.query.confirm == 'yes') {
                    if (!res.locals.authz_result.authorized_edit) return next(error.make(403, 'Not authorized', res.locals));
                    makeAssessmentInstance(req, res, function(err, assessmentInstanceId) {
                        if (ERR(err, next)) return;
                        res.redirect(res.locals.urlPrefix + '/assessment_instance/' + assessmentInstanceId);
                    });
                } else {
                    res.render(path.join(__dirname, 'userAssessmentExam'), res.locals);
                }
            } else {
                res.redirect(res.locals.urlPrefix + '/assessment_instance/' + result.rows[0].id);
            }
        });
    }
});

module.exports = router;
