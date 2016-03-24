var _ = require('underscore');
var async = require('async');
var moment = require('moment-timezone');
var Promise = require('bluebird');

var models = require('../../models');
var config = require('../../config');
var logger = require('../../logger');

module.exports = {
    sync: function(courseInfo, testDB, callback) {
        logger.infoOverride("Syncing tests from disk to SQL DB");
        var that = module.exports;
        async.eachSeries(testDB, function(dbTest, callback) {
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
                'Quiz': 'red3',
                'Practice Quiz': 'red1',
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
                that.syncTestQuestions(test, zoneList, function(err) {
                    if (err) return callback(err);
                    that.syncAccessRules(test, dbTest, function(err) {
                        if (err) return callback(err);
                        callback(null);
                    });
                });
            }).catch(function(err) {
                callback(err);
            });
        }, function(err) {
            if (err) return callback(err);
            var tidList = _(testDB).pluck('tid');
            if (tidList.length == 0) return callback(null);
            // delete tests from the DB that aren't on disk
            var sql = 'UPDATE tests SET deleted_at = CURRENT_TIMESTAMP'
                + ' WHERE deleted_at IS NULL'
                + ' AND tid NOT IN (:tidList)'
                + ' AND (SELECT course_instance_id FROM test_sets WHERE id = test_set_id)'
                + ' = :courseInstanceId'
                + ';';
            var params = {
                tidList: tidList,
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
    },

    syncAccessRules: function(test, dbTest, callback) {
        if (!dbTest.allowAccess) return callback(null);
        var saveIds = [];
        async.eachSeries(dbTest.allowAccess, function(dbRule, callback) {
            Promise.try(function() {
                return models.AccessRule.findOrCreate({where: {
                    test_id: test.id,
                    mode: dbRule.mode ? dbRule.mode : null,
                    role: dbRule.role ? dbRule.role : null,
                    uids: dbRule.uids ? dbRule.uids : null,
                    startDate: dbRule.startDate ? moment.tz(dbRule.startDate, config.timezone).format() : null,
                    endDate: dbRule.endDate ? moment.tz(dbRule.endDate, config.timezone).format() : null,
                    credit: _(dbRule).has('credit') ? dbRule.credit : null,
                }});
            }).spread(function(rule, created) {
                saveIds.push(rule.id);
                callback(null);
            }).catch(function(err) {
                callback(err);
            });
        }, function(err) {
            if (err) return callback(err);
            if (saveIds.length == 0) return callback(null);
            // delete rules from the DB that aren't on disk
            var sql = 'UPDATE access_rules SET deleted_at = CURRENT_TIMESTAMP'
                + ' WHERE deleted_at IS NULL'
                + ' AND test_id = :testId'
                + ' AND id NOT IN (:saveIds)'
                + ';';
            var params = {
                testId: test.id,
                saveIds: saveIds,
            };
            Promise.try(function() {
                return models.sequelize.query(sql, {replacements: params});
            }).then(function() {
                callback(null);
            }).catch(function(err) {
                callback(err);
            });
        });
    },

    syncTestQuestions: function(test, zoneList, callback) {
        var that = module.exports;
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
                            that.syncTestQuestion(qid, maxPoints, pointsList, initPoints, iQuestion, zone, callback);
                        }, function(err) {
                            if (err) return callback(err);
                            callback(null);
                        });
                    } else {
                        qidList.push(dbQuestion.qid);
                        iQuestion++;
                        that.syncTestQuestion(qid, maxPoints, pointsList, initPoints, iQuestion, zone, callback);
                    }
                }, function(err) {
                    if (err) return callback(err);
                    if (qidList.length == 0) return callback(null);
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

    syncTestQuestion: function(qid, maxPoints, pointsList, initPoints, iQuestion, zone, callback) {
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
};
