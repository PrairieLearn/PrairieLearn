var _ = require('underscore');
var async = require('async');
var Promise = require('bluebird');

var models = require('../../models');
var config = require('../../config');
var logger = require('../../logger');
var db = require('../../db');

module.exports = {
    sync: function(courseInfo, testDB, questionDB, callback) {
        var that = module.exports;
        // find all the testInstances in mongo
        db.qiCollect.find({}, function(err, cursor) {
            if (err) return callback(err);
            cursor.toArray(function(err, objs) {
                if (err) return callback(err);
                // only process qInstances for tests and questions that we have on disk
                objs = _(objs).filter(function(o) {return _(testDB).has(o.tid) && _(questionDB).has(o.qid);});
                async.eachSeries(objs, function(qi, callback) {
                    Promise.try(function() {
                        var user, question, test, testInstance, testQuestion, questionInstance;
                        return Promise.try(function() {
                            return models.User.findOne({where: {
                                uid: qi.uid,
                            }});
                        }).then(function(findUser) {
                            user = findUser;
                            if (!user) throw Error('no user where uid = ' + qi.uid + ' for qiid = ' + qi.qiid);
                            return models.TestInstance.findOne({where: {
                                tiid: qi.tiid,
                            }});
                        }).then(function(findTestInstance) {
                            testInstance = findTestInstance;
                            if (!testInstance) throw Error('no testInstance where tiid = ' + qi.tiid + ' for qiid = ' + qi.qiid);
                            return models.Question.findOne({where: {
                                qid: qi.qid,
                            }});
                        }).then(function(findQuestion) {
                            question = findQuestion;
                            if (!question) throw Error('no question where qid = ' + qi.qid + ' for qiid = ' + qi.qiid);
                            return models.Test.findOne({where: {
                                tid: qi.tid,
                            }});
                        }).then(function(findTest) {
                            test = findTest;
                            if (!test) throw Error('no test where tid = ' + qi.tid + ' for qiid = ' + qi.qiid);
                            if (test.id !== testInstance.testId) {
                                logger.warn('test.id ' + test.id
                                            + ' mismatch to testInstance.test_id ' + testInstance.test_id
                                            + ' for qiid ' + qi.qiid);
                            }
                            return models.TestQuestion.findOne({where: {
                                question_id: question.id,
                                test_id: test.id,
                            }});
                        }).then(function(findTestQuestion) {
                            testQuestion = findTestQuestion;
                            if (!testQuestion) throw Error("can't find testQuestion");
                            return models.QuestionInstance.findOrCreate({where: {
                                qiid: qi.qiid,
                            }});
                        }).spread(function(newQuestionInstance, created) {
                            questionInstance = newQuestionInstance;
                            return questionInstance.update({
                                date: qi.date,
                                testQuestionId: testQuestion.id,
                                testInstanceId: testInstance.id,
                                authUserId: user.id,
                                variant_seed: qi.vid,
                                params: qi.params,
                                trueAnswer: qi.trueAnswer,
                                options: qi.options,
                            });
                        }).then(function() {
                            callback(null);
                        }).catch(function(err) {
                            logger.error(err);
                            callback(null);
                        });
                    });
                }, function(err) {
                    if (err) return callback(err);
                    callback(null);
                });
            });
        });
    },
};
