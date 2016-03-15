var _ = require('underscore');
var async = require('async');
var moment = require('moment-timezone');
var Promise = require('bluebird');
var models = require('./models');

var config = require('./config');
var logger = require('./logger');
var db = require('./db');

module.exports = {
    init: function(callback) {
        models.sequelize.sync().then(function() {
            callback(null);
        }).catch(function(err) {
            callback(err);
        });
    },

    initSemesters: function(callback) {
        Promise.try(function() {
            return models.Semester.upsert({
                shortName: 'Fa15',
                longName: 'Fall 2015',
                startDate: moment.tz('2015-08-24T00:00:01', config.timezone).format(),
                endDate: moment.tz('2016-12-18T23:59:59', config.timezone).format(),
            });
        }).then(function() {
            return models.Semester.upsert({
                shortName: 'Sp16',
                longName: 'Spring 2016',
                startDate: moment.tz('2016-01-19T00:00:01', config.timezone).format(),
                endDate: moment.tz('2016-05-13T23:59:59', config.timezone).format(),
            });
        }).then(function() {
            return models.Semester.upsert({
                shortName: 'Su16',
                longName: 'Summer 2016',
                startDate: moment.tz('2016-06-13T00:00:01', config.timezone).format(),
                endDate: moment.tz('2016-08-06T23:59:59', config.timezone).format(),
            });
        }).then(function() {
            callback(null);
        }).catch(function(err) {
            callback(err);
        });
    },

    initCourseInfo: function(courseInfo, callback) {
        Promise.try(function() {
            return models.Course.upsert({
                shortName: courseInfo.name,
                title: courseInfo.title,
            });
        }).then(function() {
            var course = models.Course.findOne({where: {shortName: courseInfo.name}});
            var semester = models.Semester.findOne({where: {shortName: config.semester}});
            return Promise.all([course, semester]);
        }).spread(function(course, semester) {
            if (!course) throw Error("no course where short_name = " + courseInfo.name);
            if (!semester) throw Error("no semester where short_name = " + config.semester);
            return models.CourseInstance.findOrCreate({where: {
                course_id: course.id,
                semester_id: semester.id,
            }, defaults: {}});
        }).spread(function(courseInstance, created) {
            courseInfo.courseInstanceId = courseInstance.id;
            callback(null);
        }).catch(function(err) {
            callback(err);
        });
    },

    initUsers: function(courseInfo, uidToRole, callback) {
        db.uCollect.find({}, {"uid": 1, "name": 1}, function(err, cursor) {
            if (err) callback(err);
            cursor.toArray(function(err, objs) {
                if (err) callback(err);
                async.map(objs, function(u, callback) {
                    Promise.try(function() {
                        return models.User.upsert({
                            uid: u.uid,
                            name: u.name
                        });
                    }).then(function() {
                        return models.User.findOne({where: {
                            uid: u.uid
                        }});
                    }).then(function(user) {
                        if (!user) throw Error("no user where uid = " + u.uid);
                        return models.Enrollment.upsert({
                            user_id: user.id,
                            course_instance_id: courseInfo.courseInstanceId,
                            role: uidToRole(u.uid),
                        });
                    }).then(function() {
                        callback(null);
                    }).catch(function(err) {
                        callback(err);
                    });
                }, function(err, objs) {
                    if (err) callback(err);
                    callback(null);
                });
            });
        });
    },

    initTests: function(courseInfo, testDB, callback) {
        // find all the tests in mongo
        db.tCollect.find({}, function(err, cursor) {
            if (err) callback(err);
            cursor.toArray(function(err, objs) {
                if (err) callback(err);
                // only keep the tests that we have on disk
                objs = _(objs).filter(function(o) {return _(testDB).has(o.tid);});
                async.map(objs, function(t, callback) {
                    var shortName = {
                        'Homework': 'HW',
                        'Quiz': 'Q',
                    }[t.set] || t.set;
                    var testSetId;
                    Promise.try(function() {
                        return models.TestSet.findOrCreate({where: {
                            shortName: shortName,
                        }});
                    }).spread(function(testSet, created) {
                        return testSet.update({
                            longName: t.set,
                            course_instance_id: courseInfo.courseInstandId,
                        });
                    }).then(function(testSet) {
                        testSetId = testSet.id;
                        return models.Test.findOrCreate({where: {
                            tid: t.tid,
                        }});
                    }).spread(function(test) {
                        return test.update({
                            type: t.type,
                            number: t.number,
                            title: t.title,
                            config: t.options,
                            test_set_id: testSetId,
                        });
                    }).then(function() {
                        callback(null);
                    }).catch(function(err) {
                        callback(err);
                    });
                }, function(err) {
                    if (err) callback(err);
                    // delete tests from the DB that aren't on disk
                    models.Test.destroy({where: {
                        tid: {
                            $notIn: _(objs).pluck('tid'),
                        },
                    }}).then(function() {
                        callback(null);
                    }).catch(function(err) {
                        callback(err);
                    });
                });
            });
        });
    },

    initTestInstances: function(courseInfo, testDB, callback) {
        // find all the testInstances in mongo
        db.tiCollect.find({}, function(err, cursor) {
            if (err) callback(err);
            cursor.toArray(function(err, objs) {
                if (err) callback(err);
                // only process tInstances for tests that we have on disk
                objs = _(objs).filter(function(o) {return _(testDB).has(o.tid);});
                async.map(objs, function(ti, callback) {
                    var user, test;
                    Promise.try(function() {
                        var user = models.User.findOne({where: {uid: ti.uid}});
                        var test = models.Test.findOne({where: {tid: ti.tid}});
                        return Promise.all([user, test]);
                    }).spread(function(u, t) {
                        user = u;
                        test = t;
                        if (!user) throw Error("no user where uid = " + ti.uid);
                        if (!test) throw Error("no test where tid = " + ti.tid);
                        return models.TestInstance.findOrCreate({where: {
                            tiid: ti.tiid,
                        }});
                    }).spread(function(testInstance, created) {
                        return testInstance.update({
                            date: ti.date,
                            number: ti.number,
                            user_id: user.id,
                            test_id: test.id,
                        });
                    }).then(function() {
                        callback(null);
                    }).catch(function(err) {
                        logger.error(err);
                        callback(null);
                    });
                }, function(err) {
                    if (err) callback(err);
                    callback(null);
                });
            });
        });
    },
};
