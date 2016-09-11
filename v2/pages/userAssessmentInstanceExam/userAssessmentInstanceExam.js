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
                            sqldb.query(sql.update_submission, params, function(err, result) {
                                if (ERR(err, callback)) return;
                                callback(null);
                            });
                        },
                        function(callback) {
                            var params = {
                                instance_question_id: workItem.instance_question.id,
                                correct: grading.correct,
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
                    assessment_instance_id: res.locals.assessmentInstance.id,
                    credit: res.locals.assessmentInstance.credit,
                };
                sqldb.query(sql.update_assessment_instance, params, function(err, result) {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
            function(callback) {
                if (!finishExam) return callback(null);
                var params = {assessment_instance_id: res.locals.assessmentInstance.id};
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

router.post('/', function(req, res, next) {
    if (res.locals.assessment.type !== 'Exam') return next();

    if (res.locals.postAction == 'grade') {
        return grade(req, res, false, function(err) {
            if (ERR(err, next)) return;
            // FIXME: can this be req.url?
            res.redirect(res.locals.urlPrefix + '/assessmentInstance/' + res.locals.assessmentInstance.id);
        });
    } else if (res.locals.postAction == 'finish') {
        return grade(req, res, true, function(err) {
            if (ERR(err, next)) return;
            // FIXME: can this be req.url?
            res.redirect(res.locals.urlPrefix + '/assessmentInstance/' + res.locals.assessmentInstance.id);
        });
    } else {
        return next(error.make(400, 'unknown action: ' + res.locals.postAction, {postAction: res.locals.postAction, postData: res.locals.postData}));
    }
});

router.get('/', function(req, res, next) {
    if (res.locals.assessment.type !== 'Exam') return next();

    var params = {assessment_instance_id: res.locals.assessmentInstance.id};
    sqldb.query(sql.get_questions, params, function(err, result) {
        if (ERR(err, next)) return;
        res.locals.questions = result.rows;
        
        res.render(path.join(__dirname, 'userAssessmentInstanceExam'), res.locals);
    });
});

module.exports = router;
