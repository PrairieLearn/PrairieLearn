var ERR = require('async-stacktrace');
var _ = require('lodash');
var async = require('async');
var fs = require('fs');
var path = require('path');

var error = require('../lib/error');
var logger = require('../lib/logger');
var questionServers = require('../question-servers');
var sqldb = require('../lib/sqldb');
var sqlLoader = require('../lib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

module.exports = {};

module.exports.gradeExam = function(assessment_instance_id, auth_user_id, credit, finishExam, callback) {
    logger.debug('gradeExam()', {assessment_instance_id: assessment_instance_id, auth_user_id: auth_user_id, credit: credit, finishExam: finishExam});
    sqldb.beginTransaction(function(err, client, done) {
        if (ERR(err, callback)) return;
        logger.debug('gradeExam(): inside beginTransaction()', {assessment_instance_id: assessment_instance_id});
    
        var workList;
        async.series([
            function(callback) {
                var params = {assessment_instance_id: assessment_instance_id};
                logger.debug('gradeExam(): calling select_work_list', {assessment_instance_id: assessment_instance_id, params: params});
                sqldb.queryWithClient(client, sql.select_work_list, params, function(err, result) {
                    if (ERR(err, callback)) return;
                    workList = result.rows;
                    logger.debug('gradeExam(): finished select_work_list', {assessment_instance_id: assessment_instance_id, workList: workList});
                    callback(null);
                });
            },
            function(callback) {
                async.each(workList, function(workItem, callback) {
                    logger.debug('gradeExam(): workItem', {assessment_instance_id: assessment_instance_id, workItem: workItem});
                    var grading;
                    async.series([
                        function(callback) {
                            logger.debug('gradeExam(): calling gradeSubmission()', {assessment_instance_id: assessment_instance_id, submission: workItem.submission, variant: workItem.variant, question: workItem.question, course: workItem.course});
                            questionServers.gradeSubmission(workItem.submission, workItem.variant, workItem.question, workItem.course, {}, function(err, g) {
                                if (ERR(err, callback)) return;
                                grading = g;
                                logger.debug('gradeExam(): finished gradeSubmission()', {assessment_instance_id: assessment_instance_id, grading: grading});
                                callback(null);
                            })
                        },
                        function(callback) {
                            var params = {
                                submission_id: workItem.submission.id,
                                score: grading.score,
                                correct: grading.correct,
                                feedback: grading.feedback,
                                auth_user_id: auth_user_id,
                            };
                            logger.debug('gradeExam(): calling update_submission', {assessment_instance_id: assessment_instance_id, params: params});
                            sqldb.queryWithClient(client, sql.update_submission, params, function(err, result) {
                                if (ERR(err, callback)) return;
                                logger.debug('gradeExam(): finished update_submission', {assessment_instance_id: assessment_instance_id, rows: result.rows});
                                callback(null);
                            });
                        },
                        function(callback) {
                            var params = {
                                instance_question_id: workItem.instance_question.id,
                                correct: grading.correct,
                                auth_user_id: auth_user_id,
                            };
                            logger.debug('gradeExam(): calling update_instance_question', {assessment_instance_id: assessment_instance_id, params: params});
                            sqldb.queryWithClient(client, sql.update_instance_question, params, function(err, result) {
                                if (ERR(err, callback)) return;
                                logger.debug('gradeExam(): finished update_instance_question', {assessment_instance_id: assessment_instance_id, rows: result.rows});
                                callback(null);
                            });
                        },
                    ], function(err) {
                        if (ERR(err, callback)) return;
                        logger.debug('gradeExam(): finished workItem', {assessment_instance_id: assessment_instance_id});
                        callback(null);
                    });
                }, function(err) {
                    if (ERR(err, callback)) return;
                    logger.debug('gradeExam(): finished workList', {assessment_instance_id: assessment_instance_id});
                    callback(null);
                });
            },
            function(callback) {
                var params = {
                    assessment_instance_id: assessment_instance_id,
                    credit: credit,
                    auth_user_id: auth_user_id,
                };
                logger.debug('gradeExam(): calling update_assessment_instance', {assessment_instance_id: assessment_instance_id, params: params});
                sqldb.queryWithClient(client, sql.update_assessment_instance, params, function(err, result) {
                    if (ERR(err, callback)) return;
                    logger.debug('gradeExam(): finished update_assessment_instance', {assessment_instance_id: assessment_instance_id, rows: result.rows});
                    callback(null);
                });
            },
            function(callback) {
                if (!finishExam) return callback(null);
                var params = {
                    assessment_instance_id: assessment_instance_id,
                    auth_user_id: auth_user_id,
                };
                logger.debug('gradeExam(): calling close_assessment_instance', {assessment_instance_id: assessment_instance_id, params: params});
                sqldb.queryWithClient(client, sql.close_assessment_instance, params, function(err, result) {
                    if (ERR(err, callback)) return;
                    logger.debug('gradeExam(): finished close_assessment_instance', {assessment_instance_id: assessment_instance_id, rows: result.rows});
                    callback(null);
                });
            },
        ], function(err) {
            logger.debug('gradeExam(): calling endTransaction()', {assessment_instance_id: assessment_instance_id, err: err});
            sqldb.endTransaction(client, done, err, function(err) {
                if (ERR(err, callback)) return;
                logger.debug('gradeExam(): finished endTransaction()', {assessment_instance_id: assessment_instance_id});
                callback(null);
            });
        });
    });
};
