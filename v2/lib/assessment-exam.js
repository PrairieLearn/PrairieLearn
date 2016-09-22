var ERR = require('async-stacktrace');
var _ = require('lodash');
var async = require('async');
var fs = require('fs');
var path = require('path');

var error = require('../error');
var logger = require('../logger');
var questionServer = require('../question-server');
var sqldb = require('../sqldb');
var sqlLoader = require('../sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

module.exports = {};

module.exports.gradeExam = function(assessment_instance_id, auth_user_id, credit, finishExam, callback) {
    sqldb.beginTransaction(function(err, client, done) {
        if (ERR(err, callback)) return;
    
        var workList;
        async.series([
            function(callback) {
                var params = {assessment_instance_id: assessment_instance_id};
                sqldb.queryWithClient(client, sql.select_work_list, params, function(err, result) {
                    if (ERR(err, callback)) return;
                    workList = result.rows;
                    callback(null);
                });
            },
            function(callback) {
                async.each(workList, function(workItem, callback) {
                    var grading;
                    async.series([
                        function(callback) {
                            questionServer.gradeSubmission(workItem.submission, workItem.variant, workItem.question, workItem.course, {}, function(err, g) {
                                if (ERR(err, callback)) return;
                                grading = g;
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
                            sqldb.query(sql.update_submission, params, function(err, result) {
                                if (ERR(err, callback)) return;
                                callback(null);
                            });
                        },
                        function(callback) {
                            var params = {
                                instance_question_id: workItem.instance_question.id,
                                correct: grading.correct,
                                auth_user_id: auth_user_id,
                            };
                            sqldb.query(sql.update_instance_question, params, function(err, result) {
                                if (ERR(err, callback)) return;
                                callback(null);
                            });
                        },
                    ], function(err) {
                        if (ERR(err, callback)) return;
                        callback(null);
                    });
                }, function(err) {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
            function(callback) {
                var params = {
                    assessment_instance_id: assessment_instance_id,
                    credit: credit,
                    auth_user_id: auth_user_id,
                };
                sqldb.query(sql.update_assessment_instance, params, function(err, result) {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
            function(callback) {
                if (!finishExam) return callback(null);
                var params = {
                    assessment_instance_id: assessment_instance_id,
                    auth_user_id: auth_user_id,
                };
                sqldb.query(sql.close_assessment_instance, params, function(err, result) {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
        ], function(err) {
            sqldb.endTransaction(client, done, err, function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        });
    });
};
