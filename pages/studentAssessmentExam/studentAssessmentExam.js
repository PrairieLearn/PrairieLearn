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
    
        var assessment_instance_id, new_questions;
        async.series([
            function(callback) {
                var params = {
                    assessment_id: res.locals.assessment.id,
                    user_id: res.locals.user.user_id,
                    mode: res.locals.authz_data.mode,
                    date: res.locals.authz_data.date,
                    time_limit_min: res.locals.authz_result.time_limit_min,
                    auto_close: res.locals.assessment.auto_close,
                };
                sqldb.queryWithClientOneRow(client, sql.insert_assessment_instance, params, function(err, result) {
                    if (ERR(err, callback)) return;
                    assessment_instance_id = result.rows[0].id;
                    callback(null);
                });
            },
            function(callback) {
                var params = {
                    assessment_id: res.locals.assessment.id,
                };
                sqldb.queryWithClient(client, sql.select_new_questions, params, function(err, result) {
                    if (ERR(err, callback)) return;
                    new_questions = result.rows;
                    callback(null);
                });
            },
            function(callback) {
                async.each(new_questions, function(new_question, callback) {
                    var params = {
                        assessment_question_id: new_question.assessment_question_id,
                        assessment_instance_id: assessment_instance_id,
                    };
                    sqldb.queryWithClientOneRow(client, sql.make_instance_question, params, function(err, result) {
                        if (ERR(err, callback)) return;
                        // FIXME: returning with error here triggers "Can't set headers" exception
                        var instanceQuestionId = result.rows[0].id;
                        questionServers.makeVariant(new_question.question, res.locals.course, {}, function(err, variant) {
                            if (ERR(err, callback)) return;
                            var params = {
                                instance_question_id: instanceQuestionId,
                                variant_seed: variant.variant_seed,
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
                var params = {assessment_instance_id: assessment_instance_id};
                sqldb.queryWithClient(client, sql.set_max_points, params, function(err) {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
        ], function(err) {
            sqldb.endTransaction(client, done, err, function(err) {
                if (ERR(err, callback)) return;
                callback(null, assessment_instance_id);
            });
        });
    });
};

router.get('/', function(req, res, next) {
    if (res.locals.assessment.type !== 'Exam') return next();
    if (res.locals.assessment.multiple_instance) {
        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
    } else {
        var params = {
            assessment_id: res.locals.assessment.id,
            user_id: res.locals.user.user_id,
        };
        sqldb.query(sql.select_single_assessment_instance, params, function(err, result) {
            if (ERR(err, next)) return;
            if (result.rowCount == 0) {
                res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
            } else {
                res.redirect(res.locals.urlPrefix + '/assessment_instance/' + result.rows[0].id);
            }
        });
    }
});

router.post('/', function(req, res, next) {
    if (res.locals.assessment.type !== 'Exam') return next();
    if (!res.locals.authz_result.authorized_edit) return next(error.make(403, 'Not authorized', res.locals));
    if (req.body.postAction == 'newInstance') {
        makeAssessmentInstance(req, res, function(err, assessment_instance_id) {
            if (ERR(err, next)) return;
            res.redirect(res.locals.urlPrefix + '/assessment_instance/' + assessment_instance_id);
        });
    } else {
        return next(error.make(400, 'unknown postAction', {locals: res.locals, body: req.body}));
    }
});

module.exports = router;
