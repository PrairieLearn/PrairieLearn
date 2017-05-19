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

module.exports.updateExternalGrading = function(grading_job_id, grading, callback) {
    logger.debug('exam.updateExternalGrading()',
                 {grading_job_id: grading_job_id, grading: grading});
    sqldb.beginTransaction(function(err, client, done) {
        if (ERR(err, callback)) return;
        logger.debug('exam.updateExternalGrading(): finished beginTransaction()',
                     {grading_job_id: grading_job_id});

        var auth_user_id, grading_not_needed, instance_question_id, assessment_instance_id, credit;
        async.series([
            function(callback) {
                var params = {grading_job_id: grading_job_id};
                logger.debug('exam.updateExternalGrading(): calling lock_with_grading_job_id',
                             {grading_job_id: grading_job_id, params: params});
                sqldb.queryWithClientOneRow(client, sql.lock_with_grading_job_id, params, function(err, result) {
                    if (ERR(err, callback)) return;
                    auth_user_id = result.rows[0].auth_user_id;
                    grading_not_needed = result.rows[0].grading_not_needed;
                    instance_question_id = result.rows[0].instance_question_id;
                    assessment_instance_id = result.rows[0].assessment_instance_id;
                    credit = result.rows[0].credit;
                    logger.debug('exam.updateExternalGrading(): finished lock_with_grading_job_id',
                                 {grading_job_id: grading_job_id, auth_user_id: auth_user_id,
                                  grading_not_needed: grading_not_needed,
                                  instance_question_id: instance_question_id,
                                  assessment_instance_id: assessment_instance_id, credit: credit});
                    callback(null);
                });
            },
            function(callback) {
                if (grading_not_needed) return callback(null);
                async.series([
                    function(callback) {
                        var params = {
                            grading_job_id: grading_job_id,
                            score: grading.score,
                            correct: grading.correct,
                            feedback: grading.feedback,
                            grading_started_at: grading.startTime,
                            grading_finished_at: grading.endTime
                        };
                        logger.debug('exam.updateExternalGrading(): calling update_grading_job_and_submission',
                                     {grading_job_id: grading_job_id, params: params});
                        sqldb.queryWithClient(client, sql.update_grading_job_and_submission, params, function(err) {
                            if (ERR(err, callback)) return;
                            logger.debug('exam.updateExternalGrading(): finished update_grading_job_and_submission',
                                         {grading_job_id: grading_job_id});
                            callback(null);
                        });
                    },
                    function(callback) {
                        var params = [
                            instance_question_id,
                            grading.correct,
                            auth_user_id,
                        ];
                        logger.debug('exam.updateExternalGrading(): calling instance_questions_grade',
                                     {grading_job_id: grading_job_id, params: params});
                        sqldb.callWithClient(client, 'instance_questions_grade', params, function(err, result) {
                            if (ERR(err, callback)) return;
                            logger.debug('exam.updateExternalGrading(): finished instance_questions_grade',
                                         {grading_job_id: grading_job_id});
                            callback(null);
                        });
                    },
                    function(callback) {
                        var params = [
                            assessment_instance_id,
                            auth_user_id,
                            credit,
                        ];
                        logger.debug('exam.updateExternalGrading(): calling assessment_instances_grade',
                                     {grading_job_id: grading_job_id, params: params});
                        sqldb.callWithClient(client, 'assessment_instances_grade', params, function(err, result) {
                            if (ERR(err, callback)) return;
                            logger.debug('exam.updateExternalGrading(): finished assessment_instances_grade',
                                         {grading_job_id: grading_job_id});
                            callback(null);
                        });
                    },
                ], function(err) {
                    if (ERR(err, callback)) return;
                    logger.debug('exam.updateExternalGrading(): finished inner async.series()',
                                 {grading_job_id: grading_job_id});
                    callback(null);
                });
            },
        ], function(err) {
            logger.debug('exam.updateExternalGrading(): calling endTransaction()',
                         {grading_job_id: grading_job_id, err: err});
            sqldb.endTransaction(client, done, err, function(err) {
                if (ERR(err, callback)) return;
                logger.debug('exam.updateExternalGrading(): finished endTransaction()',
                             {grading_job_id: grading_job_id});
                callback(null);
            });
        });
    });
};

module.exports.gradeAssessmentInstance = function(assessment_instance_id, auth_user_id, credit, finish, callback) {
    logger.debug('exam.gradeAssessmentInstance()',
                 {assessment_instance_id: assessment_instance_id, auth_user_id: auth_user_id,
                  credit: credit, finish: finish});
    sqldb.beginTransaction(function(err, client, done) {
        if (ERR(err, callback)) return;
        logger.debug('exam.gradeAssessmentInstance(): finished beginTransaction()',
                     {assessment_instance_id: assessment_instance_id});

        var workList, external_grading_job_ids = [];
        async.series([
            function(callback) {
                var params = {assessment_instance_id: assessment_instance_id};
                logger.debug('exam.gradeAssessmentInstance(): calling lock_with_assessment_instance_id',
                             {assessment_instance_id: assessment_instance_id, params: params});
                sqldb.queryWithClientOneRow(client, sql.lock_with_assessment_instance_id, params, function(err) {
                    if (ERR(err, callback)) return;
                    logger.debug('exam.gradeAssessmentInstance(): finished lock_with_assessment_instance_id',
                                 {assessment_instance_id: assessment_instance_id});
                    callback(null);
                });
            },
            function(callback) {
                var params = {assessment_instance_id: assessment_instance_id};
                logger.debug('exam.gradeAssessmentInstance(): calling select_work_list',
                             {assessment_instance_id: assessment_instance_id, params: params});
                sqldb.queryWithClient(client, sql.select_work_list, params, function(err, result) {
                    if (ERR(err, callback)) return;
                    workList = result.rows;
                    logger.debug('exam.gradeAssessmentInstance(): finished select_work_list',
                                 {assessment_instance_id: assessment_instance_id, workList: workList});
                    callback(null);
                });
            },
            function(callback) {
                async.each(workList, function(workItem, callback) {
                    logger.debug('exam.gradeAssessmentInstance(): workItem',
                                 {assessment_instance_id: assessment_instance_id,
                                  submission_id: workItem.submission_id, workItem: workItem});
                    questionServers.gradeSavedSubmission(client, workItem.submission_id, auth_user_id, workItem.variant, workItem.question, workItem.course, function(err, grading_job) {
                        if (ERR(err, callback)) return;
                        logger.debug('exam.gradeAssessmentInstance(): finished gradeSavedSubmission()',
                                     {assessment_instance_id: assessment_instance_id,
                                      submission_id: workItem.submission_id, grading_job: grading_job});
                        if (grading_job.grading_method == 'Internal') {
                            if (grading_job.correct == null) return callback(new Error("Invalid 'correct' value"));
                            var params = [
                                workItem.instance_question_id,
                                grading_job.correct,
                                auth_user_id,
                            ];
                            logger.debug('exam.gradeAssessmentInstance(): calling instance_questions_grade',
                                         {assessment_instance_id: assessment_instance_id,
                                          submission_id: workItem.submission_id, params: params});
                            sqldb.callWithClient(client, 'instance_questions_grade', params, function(err) {
                                if (ERR(err, callback)) return;
                                logger.debug('exam.gradeAssessmentInstance(): finished instance_question_grade',
                                             {assessment_instance_id: assessment_instance_id,
                                              submission_id: workItem.submission_id});
                                callback(null);
                            });
                        } else if (grading_job.grading_method == 'External') {
                            external_grading_job_ids.push(grading_job.id);
                            logger.debug('exam.gradeAssessmentInstance(): pushed to external_grading_job_ids',
                                         {assessment_instance_id: assessment_instance_id,
                                          external_grading_job_ids: external_grading_job_ids});
                            var params = {
                                instance_question_id: workItem.instance_question_id,
                                auth_user_id: auth_user_id,
                            };
                            logger.debug('exam.gradeAssessmentInstance(): calling update_instance_question_in_grading',
                                         {assessment_instance_id: assessment_instance_id,
                                          submission_id: workItem.submission_id, params: params});
                            sqldb.queryWithClient(client, sql.update_instance_question_in_grading, params, function(err) {
                                if (ERR(err, callback)) return;
                                logger.debug('exam.gradeAssessmentInstance(): finished update_instance_question_in_grading',
                                             {assessment_instance_id: assessment_instance_id,
                                              submission_id: workItem.submission_id});
                                callback(null);
                            });
                        } else if (grading_job.grading_method == 'Manual') {
                            var params = {
                                instance_question_id: workItem.instance_question_id,
                                auth_user_id: auth_user_id,
                            };
                            logger.debug('exam.gradeAssessmentInstance(): calling update_instance_question_in_grading',
                                         {assessment_instance_id: assessment_instance_id,
                                          submission_id: workItem.submission_id, params: params});
                            sqldb.queryWithClient(client, sql.update_instance_question_in_grading, params, function(err) {
                                if (ERR(err, callback)) return;
                                logger.debug('exam.gradeAssessmentInstance(): finished update_instance_question_in_grading',
                                             {assessment_instance_id: assessment_instance_id,
                                              submission_id: workItem.submission_id});
                                callback(null);
                            });
                        } else {
                            callback(new Error('Invalid grading_job state'));
                        }
                    });
                }, function(err) {
                    if (ERR(err, callback)) return;
                    logger.debug('exam.gradeAssessmentInstance(): finished workList',
                                 {assessment_instance_id: assessment_instance_id});
                    callback(null);
                });
            },
            function(callback) {
                var params = [
                    assessment_instance_id,
                    auth_user_id,
                    credit,
                ];
                logger.debug('exam.gradeAssessmentInstance(): calling assessment_instances_grade',
                             {assessment_instance_id: assessment_instance_id, params: params});
                sqldb.callWithClient(client, 'assessment_instances_grade', params, function(err, result) {
                    if (ERR(err, callback)) return;
                    logger.debug('exam.gradeAssessmentInstance(): finished assessment_instances_grade',
                                 {assessment_instance_id: assessment_instance_id, rows: result.rows});
                    callback(null);
                });
            },
            function(callback) {
                if (!finish) return callback(null);
                var params = {
                    assessment_instance_id: assessment_instance_id,
                    auth_user_id: auth_user_id,
                };
                logger.debug('exam.gradeAssessmentInstance(): calling close_assessment_instance',
                             {assessment_instance_id: assessment_instance_id, params: params});
                sqldb.queryWithClient(client, sql.close_assessment_instance, params, function(err, result) {
                    if (ERR(err, callback)) return;
                    logger.debug('exam.gradeAssessmentInstance(): finished close_assessment_instance',
                                 {assessment_instance_id: assessment_instance_id, rows: result.rows});
                    callback(null);
                });
            },
        ], function(err) {
            logger.debug('exam.gradeAssessmentInstance(): calling endTransaction()',
                         {assessment_instance_id: assessment_instance_id, err: err});
            sqldb.endTransaction(client, done, err, function(err) {
                if (ERR(err, callback)) return;
                logger.debug('exam.gradeAssessmentInstance(): finished endTransaction()',
                             {assessment_instance_id: assessment_instance_id});

                logger.debug('exam.gradeAssessmentInstance(): calling submitExternalGradingJobs()',
                             {assessment_instance_id: assessment_instance_id,
                              external_grading_job_ids: external_grading_job_ids,
                              auth_user_id: auth_user_id});
                questionServers.submitExternalGradingJobs(external_grading_job_ids, auth_user_id, function(err) {
                    if (ERR(err, callback)) return;
                    logger.debug('exam.gradeAssessmentInstance(): finished submitExternalGradingJobs()',
                                 {assessment_instance_id: assessment_instance_id});
                    callback(null);
                });
            });
        });
    });
};
