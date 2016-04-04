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
        db.sCollect.find({}, function(err, cursor) {
            if (err) return callback(err);
            cursor.toArray(function(err, objs) {
                if (err) return callback(err);
                // only process submissions for questions that we have on disk
                objs = _(objs).filter(function(o) {return _(questionDB).has(o.qid);});
                async.forEachOfSeries(objs, function(s, i, callback) {
                    if (i % 1000 === 0) logger.infoOverride("submissions: " + i + " of " + objs.length);
                    Promise.try(function() {
                        var user, questionInstance, submission, grading;
                        return Promise.try(function() {
                            return models.User.findOne({where: {
                                uid: s.uid,
                            }});
                        }).then(function(findUser) {
                            user = findUser;
                            if (!user) throw Error('no user where uid = ' + s.uid + ' for sid = ' + s.sid);
                            return models.QuestionInstance.findOne({where: {
                                qiid: s.qiid,
                            }});
                        }).then(function(findQuestionInstance) {
                            questionInstance = findQuestionInstance;
                            if (!questionInstance) throw Error('no questionInstance where qiid = ' + s.qiid + ' for sid = ' + s.sid);
                            return models.Submission.findOrCreate({where: {
                                sid: s.sid,
                            }});
                        }).spread(function(newSubmission, created) {
                            submission = newSubmission;
                            return submission.update({
                                date: s.date,
                                questionInstanceId: questionInstance.id,
                                authUserId: user.id,
                                submittedAnswer: s.submittedAnswer,
                                type: (s.practice ? 'practice' : 'score'),
                                overrideScore: s.overrideScore,
                            });
                        }).then(function() {
                            return models.Grading.findOrCreate({where: {
                                submissionId: submission.id,
                            }});
                        }).spread(function(newGrading, created) {
                            grading = newGrading;
                            if (!created) return Promise.resolve();
                            return Promise.try(function() {
                                return grading.update({
                                    date: s.date,
                                    authUserId: user.id,
                                    score: s.score,
                                    feedback: s.feedback,
                                });
                            }).then(function() {
                                // make question score and test score from testDB data
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
