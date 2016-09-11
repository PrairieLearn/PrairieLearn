var ERR = require('async-stacktrace');
var _ = require('lodash');
var async = require('async');
var path = require('path');
var csvStringify = require('csv').stringify;
var express = require('express');
var router = express.Router();

var error = require('../../error');
var questionServer = require('../../question-server');
var logger = require('../../logger');
var sqldb = require('../../sqldb');
var sqlLoader = require('../../sql-loader');

var sql = sqlLoader.load(path.join(__dirname, 'userAssessmentInstanceExam.sql'));

function grade(req, res, finishExam, callback) {
    sqldb.beginTransaction(function(err, client, done) {
        if (ERR(err, callback)) return;
    
        var workList;
        async.series([
            function(callback) {
                var params = {assessment_instance_id: res.locals.assessmentInstance.id};
                sqldb.queryWithClient(client, sql.get_work_list, params, function(err, result) {
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
                            questionServer.gradeSubmission(workItem.submission, workItem.variant, workItem.question, res.locals.course, {}, function(err, g) {
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
                            };
                            sqldb.queryOneRow(sql.update_submission, params, function(err, result) {
                                if (ERR(err, callback)) return;
                                callback(null);
                            });
                        },
                        function(callback) {
                            var params = {
                                instance_question_id: workItem.instance_question_id,
                                correct: grading.correct,
                            };
                            sqldb.queryOneRow(sql.update_instance_question, params, function(err, result) {
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
                    assessment_instance_id: res.locals.assessmentInstance.id,
                    credit: res.locals.assessmentInstance.credit,
                };
                sqldb.queryOneRow(sql.update_assessment_instance, params, function(err, result) {
                    if (ERR(err, callback)) return;
                    // don't overwrite entire object in case someone added extra fields at some point
                    _.assign(res.locals.assessmentInstance, result.rows[0]);
                    callback(null);
                });
            },
            function(callback) {
                if (!finishExam) return callback(null);
                var params = {assessment_instance_id: res.locals.assessmentInstance.id};
                sqldb.queryOneRow(sql.close_assessment_instance, params, function(err, result) {
                    if (ERR(err, callback)) return;
                    // don't overwrite entire object in case someone added extra fields at some point
                    _.assign(res.locals.assessmentInstance, result.rows[0]);
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

function processPost(req, res, callback) {
    if (!res.locals.postAction) return callback(null);
    if (res.locals.postAction == 'grade') {
        return grade(req, res, false, function(err) {
            if (ERR(err, callback)) return;
            callback(null);
        });
    } else if (res.locals.postAction == 'finish') {
        return grade(req, res, true, function(err) {
            if (ERR(err, callback)) return;
            callback(null);
        });
    } else {
        return callback(error.make(400, 'unknown action: ' + res.locals.postAction, {postAction: res.locals.postAction, postData: res.locals.postData}));
    }
}

function handle(req, res, next) {
    if (res.locals.assessment.type !== 'Exam') return next();

    processPost(req, res, function(err) {
        if (ERR(err, next)) return;
        
        var params = {assessment_instance_id: res.locals.assessmentInstance.id};
        sqldb.query(sql.get_questions, params, function(err, result) {
            if (ERR(err, next)) return;
            res.locals.questions = result.rows;
            
            res.render(path.join(__dirname, 'userAssessmentInstanceExam'), res.locals);
        });
    });
}

router.get('/', handle);
router.post('/', handle);

module.exports = router;
