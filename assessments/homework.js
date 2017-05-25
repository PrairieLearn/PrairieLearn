var ERR = require('async-stacktrace');
var async = require('async');

var logger = require('../lib/logger');
var questionServers = require('../question-servers');
var sqldb = require('../lib/sqldb');
var sqlLoader = require('../lib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

module.exports = {};

module.exports.updateExternalGrading = function(grading_job_id, grading, callback) {
    logger.debug('homework.updateExternalGrading()',
                 {grading_job_id: grading_job_id, grading: grading});
    sqldb.beginTransaction(function(err, client, done) {
        if (ERR(err, callback)) return;
        logger.debug('homework.updateExternalGrading(): finished beginTransaction()',
                     {grading_job_id: grading_job_id});

        var auth_user_id, grading_not_needed, variant_id, instance_question_id, assessment_instance_id, credit;
        async.series([
            function(callback) {
                var params = {grading_job_id: grading_job_id};
                logger.debug('homework.updateExternalGrading(): calling lock_with_grading_job_id',
                             {grading_job_id: grading_job_id, params: params});
                sqldb.queryWithClientOneRow(client, sql.lock_with_grading_job_id, params, function(err, result) {
                    if (ERR(err, callback)) return;
                    auth_user_id = result.rows[0].auth_user_id;
                    grading_not_needed = result.rows[0].grading_not_needed;
                    variant_id = result.rows[0].variant_id;
                    instance_question_id = result.rows[0].instance_question_id;
                    assessment_instance_id = result.rows[0].assessment_instance_id;
                    credit = result.rows[0].credit;
                    logger.debug('homework.updateExternalGrading(): finished lock_with_grading_job_id',
                                 {grading_job_id: grading_job_id, auth_user_id: auth_user_id,
                                  grading_not_needed: grading_not_needed, variant_id: variant_id,
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
                        logger.debug('homework.updateExternalGrading(): calling update_grading_job_and_submission',
                                     {grading_job_id: grading_job_id, params: params});
                        sqldb.queryWithClient(client, sql.update_grading_job_and_submission, params, function(err) {
                            if (ERR(err, callback)) return;
                            logger.debug('homework.updateExternalGrading(): finished update_grading_job_and_submission',
                                         {grading_job_id: grading_job_id});
                            callback(null);
                        });
                    },
                    function(callback) {
                        var params = {variant_id: variant_id};
                        logger.debug('homework.updateExternalGrading(): calling update_variant',
                                     {grading_job_id: grading_job_id, params: params});
                        sqldb.queryWithClient(client, sql.update_variant, params, function(err) {
                            if (ERR(err, callback)) return;
                            logger.debug('homework.updateExternalGrading(): finished update_variant',
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
                        logger.debug('homework.updateExternalGrading(): calling instance_questions_grade',
                                     {grading_job_id: grading_job_id, params: params});
                        sqldb.callWithClient(client, 'instance_questions_grade', params, function(err, _result) {
                            if (ERR(err, callback)) return;
                            logger.debug('homework.updateExternalGrading(): finished instance_questions_grade',
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
                        logger.debug('homework.updateExternalGrading(): calling assessment_instances_grade',
                                     {grading_job_id: grading_job_id, params: params});
                        sqldb.callWithClient(client, 'assessment_instances_grade', params, function(err, _result) {
                            if (ERR(err, callback)) return;
                            logger.debug('homework.updateExternalGrading(): finished assessment_instances_grade',
                                         {grading_job_id: grading_job_id});
                            callback(null);
                        });
                    },
                ], function(err) {
                    if (ERR(err, callback)) return;
                    logger.debug('homework.updateExternalGrading(): finished inner async.series()',
                                 {grading_job_id: grading_job_id});
                    callback(null);
                });
            },
        ], function(err) {
            logger.debug('homework.updateExternalGrading(): calling endTransaction()',
                         {grading_job_id: grading_job_id, err: err});
            sqldb.endTransaction(client, done, err, function(err) {
                if (ERR(err, callback)) return;
                logger.debug('homework.updateExternalGrading(): finished endTransaction()',
                             {grading_job_id: grading_job_id});
                callback(null);
            });
        });
    });
};

module.exports.submitAndGrade = function(submission, instance_question_id, question, course, callback) {
    logger.debug('homework.submitAndGrade()',
                 {submission: submission, instance_question_id: instance_question_id,
                  question: question, course: course});
    sqldb.beginTransaction(function(err, client, done) {
        if (ERR(err, callback)) return;
        logger.debug('homework.submitAndGrade(): finished beginTransaction()',
                     {instance_question_id: instance_question_id});

        var variant, assessment_instance_id, submission_id, external_grading_job_ids = [];
        async.series([
            function(callback) {
                var params = {
                    variant_id: submission.variant_id,
                    instance_question_id: instance_question_id,
                };
                logger.debug('homework.submitAndGrade(): calling lock_with_variant_id',
                             {instance_question_id: instance_question_id, params: params});
                sqldb.queryWithClientOneRow(client, sql.lock_with_variant_id, params, function(err, result) {
                    if (ERR(err, callback)) return;
                    variant = result.rows[0].variant;
                    assessment_instance_id = result.rows[0].assessment_instance_id;
                    logger.debug('homework.submitAndGrade(): finished lock_with_variant_id',
                                 {instance_question_id: instance_question_id, variant: variant,
                                  assessment_instance_id: assessment_instance_id});
                    callback(null);
                });
            },
            function(callback) {
                var params = [
                    instance_question_id,
                    submission.auth_user_id,
                    submission.submitted_answer,
                    submission.type,
                    submission.credit,
                    submission.mode,
                    submission.variant_id,
                ];
                logger.debug('homework.submitAndGrade(): calling submissions_insert',
                             {instance_question_id: instance_question_id, params: params});
                sqldb.callWithClientOneRow(client, 'submissions_insert', params, function(err, result) {
                    if (ERR(err, callback)) return;
                    submission_id = result.rows[0].submission_id;
                    logger.debug('homework.submitAndGrade(): finished submissions_insert',
                                 {instance_question_id: instance_question_id,
                                  submission_id: submission_id});
                    callback(null);
                });
            },
            function(callback) {
                logger.debug('homework.submitAndGrade(): calling gradeSavedSubmission()',
                             {instance_question_id: instance_question_id,
                              submission_id: submission_id, variant: variant,
                              question: question, course: course});
                questionServers.gradeSavedSubmission(client, submission_id, submission.auth_user_id, variant, question, course, function(err, grading_job) {
                    if (ERR(err, callback)) return;
                    logger.debug('homework.submitAndGrade(): finished gradeSavedSubmission()',
                                 {instance_question_id: instance_question_id, grading_job: grading_job});
                    if (grading_job.grading_method == 'Internal') {
                        if (grading_job.correct == null) return callback(new Error('Invalid \'correct\' value'));
                        let params = [
                            instance_question_id,
                            grading_job.correct,
                            submission.auth_user_id,
                        ];
                        logger.debug('homework.submitAndGrade(): calling instance_questions_grade',
                                     {instance_question_id: instance_question_id, params: params});
                        sqldb.callWithClient(client, 'instance_questions_grade', params, function(err, _result) {
                            if (ERR(err, callback)) return;
                            logger.debug('homework.submitAndGrade(): finished instance_questions_grade',
                                         {instance_question_id: instance_question_id});
                            callback(null);
                        });
                    } else if (grading_job.grading_method == 'External') {
                        external_grading_job_ids.push(grading_job.id);
                        logger.debug('homework.submitAndGrade(): pushed to external_grading_job_ids',
                                     {instance_question_id: instance_question_id,
                                      external_grading_job_ids: external_grading_job_ids});
                        let params = {
                            instance_question_id: instance_question_id,
                            auth_user_id: submission.auth_user_id,
                        };
                        logger.debug('homework.submitAndGrade(): calling update_instance_question_in_grading',
                                     {instance_question_id: instance_question_id, params: params});
                        sqldb.queryWithClient(client, sql.update_instance_question_in_grading, params, function(err) {
                            if (ERR(err, callback)) return;
                            logger.debug('homework.submitAndGrade(): finished update_instance_question_in_grading',
                                         {instance_question_id: instance_question_id});
                            callback(null);
                        });
                    } else if (grading_job.grading_method == 'Manual') {
                        let params = {
                            instance_question_id: instance_question_id,
                            auth_user_id: submission.auth_user_id,
                        };
                        logger.debug('homework.submitAndGrade(): calling update_instance_question_in_grading',
                                     {instance_question_id: instance_question_id, params: params});
                        sqldb.queryWithClient(client, sql.update_instance_question_in_grading, params, function(err) {
                            if (ERR(err, callback)) return;
                            logger.debug('homework.submitAndGrade(): finished update_instance_question_in_grading',
                                         {instance_question_id: instance_question_id});
                            callback(null);
                        });
                    } else {
                        callback(new Error('Invalid grading_job state'));
                    }
                });
            },
            function(callback) {
                var params = {variant_id: submission.variant_id};
                logger.debug('homework.submitAndGrade(): calling update_variant',
                             {instance_question_id: instance_question_id, params: params});
                sqldb.queryWithClient(client, sql.update_variant, params, function(err) {
                    if (ERR(err, callback)) return;
                    logger.debug('homework.submitAndGrade(): finished update_variant',
                                 {instance_question_id: instance_question_id});
                    callback(null);
                });
            },
            function(callback) {
                var params = [
                    assessment_instance_id,
                    submission.auth_user_id,
                    submission.credit,
                ];
                logger.debug('homework.submitAndGrade(): calling assessment_instances_grade',
                             {instance_question_id: instance_question_id, params: params});
                sqldb.callWithClient(client, 'assessment_instances_grade', params, function(err, _result) {
                    if (ERR(err, callback)) return;
                    logger.debug('homework.submitAndGrade(): finished assessment_instances_grade',
                                 {instance_question_id: instance_question_id});
                    callback(null);
                });
            },
        ], function(err) {
            logger.debug('homework.submitAndGrade(): calling endTransaction()',
                         {instance_question_id: instance_question_id, err: err});
            sqldb.endTransaction(client, done, err, function(err) {
                if (ERR(err, callback)) return;
                logger.debug('homework.submitAndGrade(): finished endTransaction()',
                             {instance_question_id: instance_question_id});

                logger.debug('homework.submitAndGrade(): calling submitExternalGradingJobs()',
                             {instance_question_id: instance_question_id,
                              external_grading_job_ids: external_grading_job_ids,
                              auth_user_id: submission.auth_user_id});
                questionServers.submitExternalGradingJobs(external_grading_job_ids, submission.auth_user_id, function(err) {
                    if (ERR(err, callback)) return;
                    logger.debug('homework.submitAndGrade(): finished submitExternalGradingJobs()',
                                 {instance_question_id: instance_question_id});
                    callback(null);
                });
            });
        });
    });
};
