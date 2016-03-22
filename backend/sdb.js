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
        logger.infoOverride("Updating semesters in SQL DB");
        Promise.try(function() {
            return models.Semester.upsert({
                shortName: 'Sp15',
                longName: 'Spring 2015',
                startDate: moment.tz('2015-01-20T00:00:01', config.timezone).format(),
                endDate: moment.tz('2015-05-15T23:59:59', config.timezone).format(),
            });
        }).then(function() {
            return models.Semester.upsert({
                shortName: 'Fa15',
                longName: 'Fall 2015',
                startDate: moment.tz('2015-08-24T00:00:01', config.timezone).format(),
                endDate: moment.tz('2015-12-18T23:59:59', config.timezone).format(),
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
        logger.infoOverride("Updating course in SQL DB");
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
            courseInfo.courseId = courseInstance.course_id;
            callback(null);
        }).catch(function(err) {
            callback(err);
        });
    },

    initUsers: function(courseInfo, uidToRole, callback) {
        logger.infoOverride("Updating users in SQL DB");
        db.uCollect.find({}, {"uid": 1, "name": 1}, function(err, cursor) {
            if (err) callback(err);
            cursor.toArray(function(err, objs) {
                if (err) callback(err);
                async.each(objs, function(u, callback) {
                    var user;
                    Promise.try(function() {
                        return models.User.upsert({
                            uid: u.uid,
                            name: u.name
                        });
                    }).then(function() {
                        return models.User.findOne({where: {
                            uid: u.uid
                        }});
                    }).then(function(findUser) {
                        user = findUser;
                        if (!user) throw Error("no user where uid = " + u.uid);
                        var role = uidToRole(u.uid);
                        if (PrairieRole.isAsPowerful(role, 'Instructor')) {
                            var sql = 'INSERT INTO enrollments'
                                + ' (role,user_id,course_instance_id,created_at,updated_at)'
                                + ' ('
                                + '     SELECT role,user_id,id,nu.created_at,nu.updated_at'
                                + '     FROM course_instances,'
                                + '     (VALUES (:user_id,:role::enum_enrollments_role,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP))'
                                + '     AS nu (user_id,role,created_at,updated_at)'
                                + '     WHERE course_id = :course_id'
                                + '     AND deleted_at IS NULL'
                                + ' )'
                                + ' ON CONFLICT (user_id,course_instance_id)'
                                + ' DO UPDATE SET (role,updated_at) = (EXCLUDED.role,EXCLUDED.updated_at)'
                                + ' WHERE EXCLUDED.role != enrollments.role'
                                + ';';
                            var params = {
                                user_id: user.id,
                                role: role,
                                course_id: courseInfo.courseId,
                            };
                            return models.sequelize.query(sql, {replacements: params});
                        } else {
                            return models.Enrollment.upsert({
                                user_id: user.id,
                                course_instance_id: courseInfo.courseInstanceId,
                                role: role,
                            });
                        }
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

    initQuestions: function(courseInfo, questionDB, callback) {
        logger.infoOverride("Updating questions in SQL DB");
        async.eachSeries(_(questionDB).values(), function(q, callback) {
            // need to do this in series because topics don't have unique names,
            // so Topic.findAndCreate() will produce duplicates
            var topic, question;
            Promise.try(function() {
                return models.Topic.findOrCreate({where: {
                    name: q.topic,
                }});
            }).spread(function(t, created) {
                topic = t;
                return models.Question.findOrCreate({where: {
                    qid: q.qid,
                }});
            }).spread(function(newQuestion, created) {
                question = newQuestion;
                return question.update({
                    type: q.type,
                    title: q.title,
                    config: q.options,
                    topic_id: topic.id,
                    course_id: courseInfo.courseId,
                });
            }).then(function() {
                callback(null);
            }).catch(function(err) {
                callback(err);
            });
        }, function(err) {
            if (err) callback(err);
            // delete questions from the DB that aren't on disk
            models.Question.destroy({where: {
                course_id: courseInfo.courseId,
                qid: {
                    $notIn: _.chain(questionDB).values().pluck('tid').value(),
                },
            }}).then(function() {
                callback(null);
            }).catch(function(err) {
                callback(err);
            });
        });
    },

    initTestQuestion: function(qid, maxPoints, pointsList, initPoints, iQuestion, zone, callback) {
        var question, testQuestion;
        Promise.try(function() {
            return models.Question.findOne({where: {
                qid: qid,
            }});
        }).then(function(newQuestion) {
            if (!newQuestion) throw Error("no question where qid = " + qid);
            question = newQuestion;
            return models.TestQuestion.findOrCreate({where: {
                zone_id: zone.id,
                number: iQuestion,
            }});
        }).spread(function(newTestQuestion, created) {
            testQuestion = newTestQuestion;
            return testQuestion.update({
                question_id: question.id,
                maxPoints: maxPoints,
                pointsList: pointsList,
                initPoints: initPoints,
            });
        }).then(function() {
            callback(null);
        }).catch(function(err) {
            callback(err);
        });
    },
    
    initTestQuestions: function(test, zoneList, callback) {
        var that = this;
        var iQuestion = 0;
        async.forEachOfSeries(zoneList, function(dbZone, iDbZone, callback) {
            var zone;
            Promise.try(function() {
                return models.Zone.findOrCreate({where: {
                    test_id: test.id,
                    number: iDbZone + 1,
                }});
            }).spread(function(newZone, created) {
                zone = newZone;
                return zone.update({
                    title: dbZone.title,
                });
            }).then(function() {
                // have the zone, make the questions
                qidList = []
                async.eachSeries(dbZone.questions, function(dbQuestion, callback) {
                    var qid = null, qids = null, maxPoints = null, pointsList = null, initPoints = null;
                    if (_(dbQuestion).isString()) {
                        qid = dbQuestion;
                        maxPoints = 1;
                    } else {
                        if (_(dbQuestion).has('qids')) {
                            qids = dbQuestion.qids;
                        } else {
                            qid = dbQuestion.qid;
                        }
                        if (_(dbQuestion).has('points')) {
                            maxPoints = _(dbQuestion.points).max();
                            pointsList = dbQuestion.points;
                        } else if (_(dbQuestion).has('initValue')) {
                            maxPoints = dbQuestion.maxScore;
                            initPoints = dbQuestion.initValue;
                        }
                    }
                    if (qids) {
                        async.eachSeries(qids, function(qid, callback) {
                            qidList.push(qid);
                            iQuestion++;
                            that.initTestQuestion(qid, maxPoints, pointsList, initPoints, iQuestion, zone, callback);
                        }, function(err) {
                            if (err) callback(err);
                            callback(null);
                        });
                    } else {
                        qidList.push(dbQuestion.qid);
                        iQuestion++;
                        that.initTestQuestion(qid, maxPoints, pointsList, initPoints, iQuestion, zone, callback);
                    }
                }, function(err) {
                    if (err) return callback(err);
                    // delete questions from the DB that aren't on disk
                    var sql = 'UPDATE test_questions SET deleted_at = CURRENT_TIMESTAMP'
                        + ' WHERE (deleted_at IS NULL)'
                        + ' AND (zone_id = :zoneId)'
                        + ' AND ((SELECT qid FROM questions WHERE id = question_id) NOT IN (:qidList))'
                        + ';'
                    var params = {
                        zoneId: zone.id,
                        qidList: qidList,
                    };
                    Promise.try(function() {
                        return models.sequelize.query(sql, {replacements: params});
                    }).then(function() {
                        callback(null);
                    }).catch(function(err) {
                        callback(err);
                    });
                });
            }).catch(function(err) {
                callback(err);
            });
        }, function(err) {
            if (err) return callback(err);
            // delete zones from the DB that aren't on disk
            models.Zone.destroy({where: {
                test_id: test.id,
                number: {
                    $notIn: _.range(1, zoneList.length + 1),
                },
            }}).then(function() {
                callback(null);
            }).catch(function(err) {
                callback(err);
            });
        });
    },
    
    initTests: function(courseInfo, testDB, callback) {
        logger.infoOverride("Updating tests in SQL DB");
        var that = this;
        // find all the tests in mongo
        db.tCollect.find({}, function(err, cursor) {
            if (err) callback(err);
            cursor.toArray(function(err, objs) {
                if (err) callback(err);
                // only keep the tests that we have on disk
                objs = _(objs).filter(function(o) {return _(testDB).has(o.tid);});
                async.eachSeries(objs, function(dbTest, callback) {
                    // need to do this in series because testSets don't have unique names,
                    // so TestSet.findAndCreate() will produce duplicates
                    var shortName = {
                        'Exam': 'E',
                        'Practice Exam': 'PE',
                        'Homework': 'HW',
                        'Quiz': 'Q',
                        'Practice Quiz': 'PQ',
                    }[dbTest.set] || dbTest.set;
                    var color = {
                        'Exam': 'red3',
                        'Practice Exam': 'red1',
                        'Homework': 'green3',
                        'Quiz': 'yellow3',
                        'Practice Quiz': 'yellow1',
                    }[dbTest.set] || 'default';
                    var testSet, test, semester, courseInstance;
                    Promise.try(function() {
                        return models.Semester.findOne({where: {
                            shortName: dbTest.semester,
                        }});
                    }).then(function(findSemester) {
                        semester = findSemester;
                        return models.CourseInstance.findOrCreate({where: {
                            course_id: courseInfo.courseId,
                            semester_id: semester.id,
                        }});
                    }).spread(function(newCourseInstance, created) {
                        courseInstance = newCourseInstance;
                        return models.TestSet.findOrCreate({where: {
                            longName: dbTest.set,
                            course_instance_id: courseInstance.id,
                        }});
                    }).spread(function(newTestSet, created) {
                        testSet = newTestSet;
                        return testSet.update({
                            shortName: shortName,
                            color: color,
                        });
                    }).then(function() {
                        return models.Test.findOrCreate({where: {
                            tid: dbTest.tid,
                        }});
                    }).spread(function(newTest, created) {
                        test = newTest;
                        return test.update({
                            type: dbTest.type,
                            number: dbTest.number,
                            title: dbTest.title,
                            config: dbTest.options,
                            test_set_id: testSet.id,
                        });
                    }).then(function() {
                        var zoneList = [];
                        if (_(dbTest).has('options') && _(dbTest.options).has('zones')) {
                            // RetryExam, new format
                            zoneList = dbTest.options.zones;
                        } else if (_(dbTest).has('options') && _(dbTest.options).has('questionGroups')) {
                            // RetryExam, old format
                            zoneList = [{questions: _(dbTest.options.questionGroups).flatten()}];
                        } else if (_(dbTest).has('options') && _(dbTest.options).has('qidGroups')) {
                            // Exam
                            zoneList = [{questions: _(dbTest.options.qidGroups).flatten()}];
                        } else if (_(dbTest).has('options') && _(dbTest.options).has('questions')) {
                            // Game
                            zoneList = [{questions: dbTest.options.questions}];
                        } else if (_(dbTest).has('options') && _(dbTest.options).has('qids')) {
                            // Basic
                            zoneList = [{questions: dbTest.options.qids}];
                        }
                        that.initTestQuestions(test, zoneList, callback);
                    }).catch(function(err) {
                        callback(err);
                    });
                }, function(err) {
                    if (err) callback(err);
                    // delete tests from the DB that aren't on disk
                    var sql = 'UPDATE tests SET deleted_at = CURRENT_TIMESTAMP'
                        + ' WHERE deleted_at IS NULL'
                        + ' AND tid NOT IN (:tidList)'
                        + ' AND (SELECT course_instance_id FROM test_sets WHERE id = test_set_id)'
                        + ' = :courseInstanceId'
                        + ';';
                    var params = {
                        tidList: _(objs).pluck('tid'),
                        courseInstanceId: courseInfo.courseInstanceId,
                    };
                    Promise.try(function(results, info) {
                        return models.sequelize.query(sql, {replacements: params});
                    }).spread(function() {
                        callback(null);
                    }).catch(function(err) {
                        callback(err);
                    });
                });
            });
        });
    },

    initTestInstances: function(courseInfo, testDB, callback) {
        logger.infoOverride("Updating test instances in SQL DB");
        // find all the testInstances in mongo
        db.tiCollect.find({}, function(err, cursor) {
            if (err) callback(err);
            cursor.toArray(function(err, objs) {
                if (err) callback(err);
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
                    if (err) callback(err);
                    callback(null);
                });
            });
        });
    },
};
