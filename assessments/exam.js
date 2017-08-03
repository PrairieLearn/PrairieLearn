var ERR = require('async-stacktrace');
var async = require('async');

var logger = require('../lib/logger');
var questionServers = require('../question-servers');
var sqldb = require('../lib/sqldb');
var sqlLoader = require('../lib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

module.exports = {};

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
                sqldb.queryWithClientOneRow(client, sql.lock_with_assessment_instance_id, params, function(err, _result) {
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
                            if (grading_job.correct == null) return callback(new Error('Invalid "correct" value'));
                            let params = [
                                workItem.instance_question_id,
                                grading_job.correct,
                                auth_user_id,
                            ];
                            logger.debug('exam.gradeAssessmentInstance(): calling instance_questions_grade',
                                         {assessment_instance_id: assessment_instance_id,
                                          submission_id: workItem.submission_id, params: params});
                            sqldb.callWithClient(client, 'instance_questions_grade', params, function(err, _result) {
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
                            let params = {
                                instance_question_id: workItem.instance_question_id,
                                auth_user_id: auth_user_id,
                            };
                            logger.debug('exam.gradeAssessmentInstance(): calling update_instance_question_in_grading',
                                         {assessment_instance_id: assessment_instance_id,
                                          submission_id: workItem.submission_id, params: params});
                            sqldb.queryWithClient(client, sql.update_instance_question_in_grading, params, function(err, _result) {
                                if (ERR(err, callback)) return;
                                logger.debug('exam.gradeAssessmentInstance(): finished update_instance_question_in_grading',
                                             {assessment_instance_id: assessment_instance_id,
                                              submission_id: workItem.submission_id});
                                callback(null);
                            });
                        } else if (grading_job.grading_method == 'Manual') {
                            let params = {
                                instance_question_id: workItem.instance_question_id,
                                auth_user_id: auth_user_id,
                            };
                            logger.debug('exam.gradeAssessmentInstance(): calling update_instance_question_in_grading',
                                         {assessment_instance_id: assessment_instance_id,
                                          submission_id: workItem.submission_id, params: params});
                            sqldb.queryWithClient(client, sql.update_instance_question_in_grading, params, function(err, _result) {
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
