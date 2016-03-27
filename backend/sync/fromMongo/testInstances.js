var _ = require('underscore');
var async = require('async');
var Promise = require('bluebird');

var models = require('../../models');
var config = require('../../config');
var db = require('../../db');

module.exports = {
    sync: function(courseInfo, testDB, callback) {
        // find all the testInstances in mongo
        db.tiCollect.find({}, function(err, cursor) {
            if (err) return callback(err);
            cursor.toArray(function(err, objs) {
                if (err) return callback(err);
                // only process tInstances for tests that we have on disk
                objs = _(objs).filter(function(o) {return _(testDB).has(o.tid);});
                async.each(objs, function(ti, callback) {
                    var user, test, testInstance;
                    Promise.try(function() {
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
                        return models.Test.findOne({where: {
                            tid: ti.tid,
                            courseInstanceId: {
                                $in: _(courseInstances).pluck('id'),
                            }
                        }});
                    }).then(function(findTest) {
                        test = findTest;
                        if (!test) throw Error("no test where tid = " + ti.tid + " and course_instance_id = " + courseInfo.courseInstanceId);
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
                        if (!_(ti).has('gradingDates') || ti.gradingDates.length === 0) {
                            callback(null);
                        } else {
                            // record a test closing at the last grading date, if it exists
                            // test opening is handled by question access logs
                            // if there are no gradings then test closing is determined from last submission
                            Promise.try(function() {
                                return models.TestState.findOrCreate({where: {
                                    testInstanceId: testInstance.id,
                                    open: false,
                                }, defaults: {
                                    date: _(ti.gradingDates).last(),
                                    authUserId: user.id,
                                }});
                            }).then(function() {
                                callback(null);
                            }).catch(function(err) {
                                logger.error(err);
                                callback(null);
                            });
                        }
                    }).catch(function(err) {
                        logger.error(err);
                        callback(null);
                    });
                }, function(err) {
                    if (err) return callback(err);
                    callback(null);
                });
            });
        });
    },
};
