var _ = require('underscore');
var moment = require('moment-timezone');
var Promise = require('bluebird');

var models = require('../../models');
var config = require('../../config');

module.exports = {
    sync: function(courseInfo, testDB, callback) {
        var that = module.exports;
        var testIDs = [];
        return Promise.try(function() {
            return Promise.all(
                _(testDB).map(function(dbTest) {
                    var semester, courseInstance, testSet, test;
                    var zoneList = [];
                    return Promise.try(function() {
                        return models.Semester.findOne({where: {
                            shortName: dbTest.semester,
                        }});
                    }).then(function(findSemester) {
                        semester = findSemester;
                        if (!semester) throw Error("can't find semester");
                        return models.CourseInstance.findOne({where: {
                            courseId: courseInfo.courseId,
                            semesterId: semester.id,
                        }});
                    }).then(function(findCourseInstance) {
                        courseInstance = findCourseInstance;
                        if (!courseInstance) throw Error("can't find couresInstance");
                        return models.TestSet.find({where: {
                            longName: dbTest.set,
                            courseInstanceId: courseInstance.id,
                        }});
                    }).then(function(findTestSet) {
                        testSet = findTestSet;
                        if (!testSet) throw Error("can't find testSet");
                        return models.Test.findOrCreate({where: {
                            tid: dbTest.tid,
                            courseInstanceId: courseInstance.id,
                        }, paranoid: false});
                    }).spread(function(newTest, created) {
                        test = newTest;
                        testIDs.push(test.id);
                        return test.update({
                            type: dbTest.type,
                            number: dbTest.number,
                            title: dbTest.title,
                            config: dbTest.options,
                            testSetId: testSet.id,
                        });
                    }).then(function() {
                        return test.restore(); // undo soft-delete just in case
                    }).then(function() {
                        return that.syncAccessRules(test, dbTest);
                    }).then(function() {
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
                        return that.syncZones(test, zoneList);
                    }).then(function() {
                        return that.syncTestQuestions(test, zoneList);
                    });
                })
            );
        }).then(function() {
            // soft-delete tests from the DB that aren't on disk and are in the current course
            var sql = 'WITH'
                + ' course_test_ids AS ('
                + '     SELECT t.id'
                + '     FROM tests AS t'
                + '     JOIN course_instances AS ci ON (ci.id = t.course_instance_id)'
                + '     WHERE ci.course_id = :courseId'
                + '     AND t.deleted_at IS NULL'
                + ' )'
                + ' UPDATE tests SET deleted_at = CURRENT_TIMESTAMP'
                + ' WHERE id IN (SELECT * FROM course_test_ids)'
                + (testIDs.length === 0 ? '' : ' AND id NOT IN (:testIDs)')
                + ' ;';
            var params = {
                testIDs: testIDs,
                courseId: courseInfo.courseId,
            };
            return models.sequelize.query(sql, {replacements: params});
        }).then(function() {
            // soft-delete test_questions from DB that don't correspond to current tests
            var sql = 'WITH'
                + ' course_test_question_ids AS ('
                + '     SELECT tq.id'
                + '     FROM test_questions AS tq'
                + '     JOIN tests AS t ON (t.id = tq.test_id)'
                + '     JOIN course_instances AS ci ON (ci.id = t.course_instance_id)'
                + '     WHERE ci.course_id = :courseId'
                + '     AND tq.deleted_at IS NULL'
                + ' )'
                + ' UPDATE test_questions SET deleted_at = CURRENT_TIMESTAMP'
                + ' WHERE id IN (SELECT * FROM course_test_question_ids)'
                + (testIDs.length === 0 ? '' : ' AND test_id NOT IN (:testIDs)')
                + ' ;';
            var params = {
                testIDs: testIDs,
                courseId: courseInfo.courseId,
            };
            return models.sequelize.query(sql, {replacements: params});
        });
    },

    syncAccessRules: function(test, dbTest) {
        var accessRuleIDs = [];
        return Promise.all(
            _(dbTest.allowAccess || []).map(function(dbRule) {
                return models.AccessRule.findOrCreate({where: {
                    testId: test.id,
                    mode: dbRule.mode ? dbRule.mode : null,
                    role: dbRule.role ? dbRule.role : null,
                    uids: dbRule.uids ? dbRule.uids : null,
                    startDate: dbRule.startDate ? moment.tz(dbRule.startDate, config.timezone).format() : null,
                    endDate: dbRule.endDate ? moment.tz(dbRule.endDate, config.timezone).format() : null,
                    credit: _(dbRule).has('credit') ? dbRule.credit : null,
                }}).spread(function(rule, created) {
                    accessRuleIDs.push(rule.id);
                    return Promise.resolve(null);
                });
            })
        ).then(function() {
            // delete rules from the DB that aren't on disk for this test
            var sql = 'DELETE FROM access_rules'
                + ' WHERE test_id = :testId'
                + (accessRuleIDs.length === 0 ? '' : ' AND id NOT IN (:accessRuleIDs)')
                + ';';
            var params = {
                testId: test.id,
                accessRuleIDs: accessRuleIDs,
            };
            return models.sequelize.query(sql, {replacements: params});
        });
    },

    syncZones: function(test, zoneList) {
        var zoneIDs = [];
        return Promise.all(
            _(zoneList).each(function(dbZone, i) {
                return models.Zone.findOrCreate({where: {
                    testId: test.id,
                    number: i + 1,
                }}).spread(function(zone, created) {
                    zoneIDs.push(zone.id);
                    return zone.update({
                        title: dbZone.title,
                    });
                });
            })
        ).then(function() {
            // delete zones from the DB that aren't on disk and are in the current test
            return models.Zone.destroy({where: {
                testId: test.id,
                id: {
                    $notIn: zoneIDs,
                },
            }});
        });
    },

    syncTestQuestions: function(test, zoneList, callback) {
        var that = module.exports;
        var iTestQuestion = 0;
        var testQuestionIDs = [];
        return Promise.all(
            _.chain(zoneList).map(function(dbZone, iZone) {
                return _(dbZone.questions).map(function(dbQuestion) {
                    var qids = null, maxPoints = null, pointsList = null, initPoints = null;
                    if (_(dbQuestion).isString()) {
                        qids = [dbQuestion];
                        maxPoints = 1;
                    } else {
                        if (_(dbQuestion).has('qids')) {
                            qids = dbQuestion.qids;
                        } else {
                            qids = [dbQuestion.qid];
                        }
                        if (_(dbQuestion).has('points')) {
                            maxPoints = _(dbQuestion.points).max();
                            pointsList = dbQuestion.points;
                        } else if (_(dbQuestion).has('initValue')) {
                            maxPoints = dbQuestion.maxScore;
                            initPoints = dbQuestion.initValue;
                        }
                    }
                    return _(qids).map(function(qid) {
                        iTestQuestion++;
                        return that.syncTestQuestion(qid, maxPoints, pointsList, initPoints, iTestQuestion, test, iZone)
                            .then(function(testQuestion) {
                                testQuestionIDs.push(testQuestion.id);
                            });
                    });
                });
            }).flatten().value()
        ).then(function() {
            // delete questions from the DB that aren't on disk
            var sql = 'UPDATE test_questions SET deleted_at = CURRENT_TIMESTAMP'
                + ' WHERE (deleted_at IS NULL)'
                + ' AND (test_id = :testId)'
                + (testQuestionIDs.length === 0 ? '' : ' AND id NOT IN (:testQuestionIDs)')
                + ';';
            var params = {
                testId: test.id,
                testQuestionIDs: testQuestionIDs,
            };
            return models.sequelize.query(sql, {replacements: params});
        });
    },

    syncTestQuestion: function(qid, maxPoints, pointsList, initPoints, iTestQuestion, test, iZone) {
        var question, zone, testQuestion;
        return Promise.try(function() {
            return models.Question.findOne({where: {
                qid: qid,
            }});
        }).then(function(findQuestion) {
            question = findQuestion;
            if (!question) throw Error("can't find question");
            return models.Zone.findOne({where: {
                testId: test.id,
                number: iZone + 1,
            }});
        }).then(function(findZone) {
            zone = findZone;
            if (!zone) throw Error("can't find zone");
            return models.TestQuestion.findOrCreate({where: {
                testId: test.id,
                questionId: question.id,
            }});
        }).spread(function(newTestQuestion, created) {
            testQuestion = newTestQuestion;
            return testQuestion.update({
                number: iTestQuestion,
                zoneId: zone.id,
                maxPoints: maxPoints,
                pointsList: pointsList,
                initPoints: initPoints,
            });
        }).then(function() {
            return testQuestion.restore(); // undo soft-delete just in case
        });
    },
};
