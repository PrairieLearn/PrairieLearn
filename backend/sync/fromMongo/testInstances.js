var _ = require('underscore');
var async = require('async');
var Promise = require('bluebird');

var models = require('../../models');
var config = require('../../config');
var logger = require('../../logger');
var db = require('../../db');

module.exports = {
    sync: function(courseInfo, testDB, callback) {
        logger.infoOverride("Updating test instances in SQL DB");
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
                        var user = models.User.findOne({where: {uid: ti.uid}});
                        var test = models.Test.findOne({where: {tid: ti.tid}});
                        return Promise.all([user, test]);
                    }).spread(function(findUser, findTest) {
                        user = findUser;
                        test = findTest;
                        if (!user) throw Error("no user where uid = " + ti.uid);
                        if (!test) throw Error("no test where tid = " + ti.tid);
                        return models.TestInstance.findOrCreate({where: {
                            tiid: ti.tiid,
                        }});
                    }).spread(function(newTestInstance, created) {
                        testInstance = newTestInstance;
                        return testInstance.update({
                            date: ti.date,
                            number: ti.number,
                            user_id: user.id,
                            test_id: test.id,
                            auth_user_id: user.id,
                        });
                    }).then(function() {
                        if (!_(ti).has('gradingDates') || ti.gradingDates.length == 0) {
                            callback(null);
                        } else {
                            // record a test closing at the last grading date, if it exists
                            // test opening is handled by question access logs
                            // if there are no gradings then test closing is determined from last submission
                            Promise.try(function() {
                                return models.TestState.findOrCreate({where: {
                                    test_instance_id: testInstance.id,
                                    open: false,
                                }, defaults: {
                                    date: _(ti.gradingDates).last(),
                                    auth_user_id: user.id,
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
