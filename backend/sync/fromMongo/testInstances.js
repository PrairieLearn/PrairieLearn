var _ = require('underscore');
var async = require('async');
var Promise = require('bluebird');

var models = require('../../models');
var config = require('../../config');
var logger = require('../../logger');
var db = require('../../db');

module.exports = {
    sync: function(courseInfo, testDB, callback) {
        var that = module.exports;
        // find all the testInstances in mongo
        db.tiCollect.find({}, function(err, cursor) {
            if (err) return callback(err);
            cursor.toArray(function(err, objs) {
                if (err) return callback(err);
                // only process tInstances for tests that we have on disk
                objs = _(objs).filter(function(o) {return _(testDB).has(o.tid);});
                Promise.all(_(objs).map(function(ti) {
                    var user, test;
                    return Promise.try(function() {
                        return models.User.findOne({where: {
                            uid: ti.uid,
                        }});
                    }).then(function(findUser) {
                        user = findUser;
                        if (!user) throw Error("no user where uid = " + ti.uid);
                        return models.CourseInstance.findAll({where: {
                            courseId: courseInfo.courseId,
                        }});
                    }).then(function(courseInstances) {
                        if (courseInstances.length === 0) throw Error('no course instances with course_id = ' + courseInfo.courseId);
                        return models.Test.findOne({where: {
                            tid: ti.tid,
                            courseInstanceId: {
                                $in: _(courseInstances).pluck('id'),
                            }
                        }});
                    }).then(function(findTest) {
                        test = findTest;
                        if (!test) throw Error("no test where tid = " + ti.tid + " and course_instance_id = " + courseInfo.courseInstanceId);
                        return models.TestInstance.findOne({where: {
                            userId: user.id,
                            testId: test.id,
                            number: ti.number,
                            tiid: {
                                $ne: ti.tiid,
                            },
                        }});
                    }).then(function(findTestInstance) {
                        if (findTestInstance) {
                            logger.warn('Duplicate test instances with:'
                                        + ' uid = ' + user.uid
                                        + ', tid = ' + test.tid
                                        + ', number = ' + ti.number
                                        + ' (tiids = ' + findTestInstance.tiid
                                        + ', ' + ti.tiid + ')'
                                        + ', discarding second instance');
                            return Promise.resolve();
                        }
                        var testInstance;
                        return Promise.try(function() {
                            return models.TestInstance.findOrCreate({where: {
                                tiid: ti.tiid,
                            }});
                        }).spread(function(newTestInstance, created) {
                            testInstance = newTestInstance;
                            return testInstance.update({
                                date: ti.date,
                                number: ti.number,
                                userId: user.id,
                                testId: test.id,
                                authUserId: user.id,
                            });
                        }).then(function() {
                            return that.syncTestStates(testInstance, ti, user);
                        }).then(function() {
                            return that.syncTestScores(testInstance, ti, user, test);
                        });
                    });
                })).then(function() {
                    callback(null);
                }).catch(function(err) {
                    callback(err);
                });
            });
        });
    },

    syncTestStates: function(testInstance, ti, user) {
        return Promise.try(function() {
            // test was opened at creation time
            return models.TestState.findOrCreate({where: {
                testInstanceId: testInstance.id,
                open: true,
            }, defaults: {
                date: ti.date,
                authUserId: user.id,
            }});
        }).then(function() {
            // record closing, if any
            if (!_(ti).has('finishDate')) return Promise.resolve();
            return models.TestState.findOrCreate({where: {
                testInstanceId: testInstance.id,
                open: false,
            }, defaults: {
                date: ti.finishDate,
                authUserId: user.id,
            }});
        });
    },

    syncTestScores: function(testInstance, ti, user, test) {
        if (test.type == 'Exam') {
            if (!_(ti).has('score')) return Promise.resolve();
            return Promise.try(function() {
                return models.TestScore.findOrCreate({where: {
                    testInstanceId: testInstance.id,
                }});
            }).spread(function(testScore, created) {
                return testScore.update({
                    date: ti.finishDate,
                    points: ti.score,
                    maxPoints: test.maxScore,
                    scorePerc: ti.scorePerc,
                    authUserId: user.id,
                });
            });
        } else if (test.type == 'RetryExam') {
            return Promise.all(_(ti.gradingDates).map(function(d, i) {
                return Promise.try(function() {
                    return models.TestScore.findOrCreate({where: {
                        testInstanceId: testInstance.id,
                        date: d,
                    }, defaults: {
                        authUserId: user.id,
                    }});
                }).spread(function(testScore, created) {
                    if (i < ti.gradingDates.length - 1) return Promise.resolve();
                    return testScore.update({
                        points: ti.score,
                        maxPoints: test.maxScore,
                        scorePerc: ti.scorePerc,
                    });
                });
            }));
        } else if (test.type == 'Basic') {
            // handled during submission sync
            return Promise.resolve();
        } else if (test.type == 'Game') {
            // handled during submission sync
            return Promise.resolve();
        } else {
            throw Error('unknown test.type');
        }
    },
};
