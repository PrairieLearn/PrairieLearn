var ERR = require('async-stacktrace');
var _ = require('lodash');
var async = require('async');
var moment = require('moment-timezone');

var logger = require('../../lib/logger');
var sqldb = require('../../lib/sqldb');
var config = require('../../lib/config');
var sqlLoader = require('../../lib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

module.exports = {
    sync: function(courseInfo, courseInstance, callback) {
        var that = module.exports;
        var assessmentIds = [];
        async.series([
            function(callback) {
                async.forEachOfSeries(courseInstance.assessmentDB, function(dbAssessment, tid, callback) {
                    logger.verbose('Syncing ' + tid);
                    var params = {
                        tid: tid,
                        type: dbAssessment.type,
                        number: dbAssessment.number,
                        title: dbAssessment.title,
                        config: dbAssessment.options,
                        multiple_instance: dbAssessment.options && dbAssessment.options.multipleInstance ? true : false,
                        shuffle_questions: dbAssessment.shuffleQuestions ? true : false,
                        max_score: dbAssessment.options ? dbAssessment.options.maxScore : null,
                        course_instance_id: courseInstance.courseInstanceId,
                        course_id: courseInfo.courseId,
                        set_name: dbAssessment.set,
                        text: dbAssessment.options ? dbAssessment.options.text : null,
                    };
                    sqldb.query(sql.insert_assessment, params, function(err, result) {
                        if (ERR(err, callback)) return;
                        var assessmentId = result.rows[0].id;
                        assessmentIds.push(assessmentId);
                        logger.verbose('Synced ' + tid + ' as assessment_id ' + assessmentId);
                        that.syncAccessRules(assessmentId, dbAssessment, function(err) {
                            if (ERR(err, callback)) return;
                            if (_(dbAssessment).has('options') && _(dbAssessment.options).has('zones')) {
                                // RetryExam, new format
                                zoneList = dbAssessment.options.zones;
                            } else if (_(dbAssessment).has('options') && _(dbAssessment.options).has('questionGroups')) {
                                // RetryExam, old format
                                zoneList = [{questions: _.flattenDeep(dbAssessment.options.questionGroups)}];
                            } else if (_(dbAssessment).has('options') && _(dbAssessment.options).has('questions')) {
                                // Homework
                                zoneList = [{questions: dbAssessment.options.questions}];
                            } else if (_(dbAssessment).has('options') && _(dbAssessment.options).has('qids')) {
                                // Basic
                                zoneList = [{questions: dbAssessment.options.qids}];
                            }
                            that.syncZones(assessmentId, zoneList, function(err) {
                                if (ERR(err, callback)) return;
                                that.syncAssessmentQuestions(assessmentId, zoneList, courseInfo, function(err) {
                                    if (ERR(err, callback)) return;
                                    callback(null);
                                });
                            });
                        });
                    });
                }, function(err) {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
            function(callback) {
                logger.verbose('Soft-deleting unused assessments');
                var params = {
                    course_instance_id: courseInstance.courseInstanceId,
                    keep_assessment_ids: assessmentIds,
                };
                sqldb.query(sql.soft_delete_unused_assessments, params, function(err) {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
            function(callback) {
                logger.verbose('Soft-deleting unused assessment questions');
                var params = {
                    course_instance_id: courseInstance.courseInstanceId,
                    keep_assessment_ids: assessmentIds,
                };
                sqldb.query(sql.soft_delete_unused_assessment_questions, params, function(err) {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
            function(callback) {
                logger.verbose('Deleting unused assessment access rules');
                sqldb.query(sql.delete_unused_assessment_access_rules, [], function(err) {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
            function(callback) {
                logger.verbose('Deleting unused zones');
                sqldb.query(sql.delete_unused_zones, [], function(err) {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
        ], function(err) {
            if (ERR(err, callback)) return;
            callback(null);
        });
    },

    syncAccessRules: function(assessmentId, dbAssessment, callback) {
        var allowAccess = dbAssessment.allowAccess || [];
        async.forEachOfSeries(allowAccess, function(dbRule, i, callback) {
            logger.verbose('Syncing assessment access rule number ' + (i + 1));
            var params = {
                assessment_id: assessmentId,
                number: i + 1,
                mode: _(dbRule).has('mode') ? dbRule.mode : null,
                role: _(dbRule).has('role') ? dbRule.role : null,
                uids: _(dbRule).has('uids') ? dbRule.uids : null,
                start_date: _(dbRule).has('startDate') ? moment.tz(dbRule.startDate, config.timezone).format() : null,
                end_date: _(dbRule).has('endDate') ? moment.tz(dbRule.endDate, config.timezone).format() : null,
                credit: _(dbRule).has('credit') ? dbRule.credit : null,
            };
            sqldb.query(sql.insert_assessment_access_rule, params, function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        }, function(err) {
            if (ERR(err, callback)) return;

            logger.verbose('Deleting excess assessment access rules for current assessment');
            var params = {
                assessment_id: assessmentId,
                last_number: allowAccess.length,
            };
            sqldb.query(sql.delete_excess_assessment_access_rules, params, function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        });
    },

    syncZones: function(assessmentId, zoneList, callback) {
        async.forEachOfSeries(zoneList, function(dbZone, i, callback) {
            logger.verbose('Syncing zone number ' + (i + 1));
            var params = {
                assessment_id: assessmentId,
                number: i + 1,
                title: dbZone.title,
                number_choose: dbZone.numberChoose,
            };
            sqldb.queryOneRow(sql.insert_zone, params, function(err, result) {
                if (ERR(err, callback)) return;
                dbZone.id = result.rows[0].id;
                callback(null);
            });
        }, function(err) {
            if (ERR(err, callback)) return;

            logger.verbose('Deleting excess zones for current assessment');
            var params = {
                assessment_id: assessmentId,
                last_number: zoneList.length,
            };
            sqldb.query(sql.delete_excess_zones, params, function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        });
    },

    syncAssessmentQuestions: function(assessmentId, zoneList, courseInfo, callback) {
        var that = module.exports;
        var iAssessmentQuestion = 0;
        var iInAlternativeGroup;
        var iAlternativeGroup = 0;
        var assessmentQuestionIds = [];
        async.forEachOfSeries(zoneList, function(dbZone, iZone, callback) {
            async.forEachOfSeries(dbZone.questions, function(dbQuestion, iQuestion, callback) {
                var alternatives = null, maxPoints = null, pointsList = null, initPoints = null;
                if (_(dbQuestion).isString()) {
                    alternatives = [{qid: dbQuestion, maxPoints: 1}];
                } else {
                    var qids = null;
                    if (_(dbQuestion).has('alternatives')) {
                        alternatives = _.map(dbQuestion.alternatives, function(question) {
                            return {
                                qid: question.qid,
                                maxPoints: _(question.points).max(),
                                pointsList: question.points,
                            };
                        });
                    } else if (_(dbQuestion).has('qids')) {
                        qids = dbQuestion.qids;
                    } else if (_(dbQuestion).has('qid')) {
                        qids = [dbQuestion.qid];
                    } else {
                        return callback(error.make(500, 'Unable to determine question qids', {dbQuestion: dbQuestion}));
                    }
                    if (qids) {
                        if (_(dbQuestion).has('points')) {
                            alternatives = _.map(qids, function(qid) {
                                return {
                                    qid: qid,
                                    maxPoints: _(dbQuestion.points).max(),
                                    pointsList: dbQuestion.points,
                                };
                            });
                        } else if (_(dbQuestion).has('initValue')) {
                            alternatives = _.map(qids, function(qid) {
                                return {
                                    qid: qid,
                                    maxPoints: dbQuestion.maxScore,
                                    initPoints: dbQuestion.initValue,
                                };
                            });
                        } else {
                            return callback(error.make(500, 'Unable to determine question points', {dbQuestion: dbQuestion}));
                        }
                    }
                }
                iAlternativeGroup++;
                var params = {
                    number: iAlternativeGroup,
                    number_choose: dbQuestion.numberChoose,
                    assessment_id: assessmentId,
                    zone_id: dbZone.id,
                };
                sqldb.queryOneRow(sql.insert_alternative_group, params, function(err, result) {
                    if (ERR(err, callback)) return;
                    var alternative_group_id = result.rows[0].id;
                    iInAlternativeGroup = 0;
                    async.eachSeries(alternatives, function(alternative, callback) {
                        iAssessmentQuestion++;
                        iInAlternativeGroup++;
                        that.syncAssessmentQuestion(alternative.qid, alternative.maxPoints, alternative.pointsList, alternative.initPoints, iInAlternativeGroup, iAssessmentQuestion, assessmentId, alternative_group_id, courseInfo, function(err, assessmentQuestionId) {
                            if (ERR(err, callback)) return;
                            assessmentQuestionIds.push(assessmentQuestionId);
                            callback(null);
                        });
                    }, function(err) {
                        if (ERR(err, callback)) return;
                            callback(null);
                    });
                });
            }, function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        }, function(err) {
            if (ERR(err, callback)) return;

            logger.verbose('Deleting excess alternative groups for current assessment');
            var params = {
                assessment_id: assessmentId,
                last_number: iAlternativeGroup,
            };
            sqldb.query(sql.delete_excess_alternative_groups, params, function(err, result) {
                if (ERR(err, callback)) return;

                logger.verbose('Soft-deleting unused assessment questions for current assessment');
                var params = {
                    assessment_id: assessmentId,
                    keep_assessment_question_ids: assessmentQuestionIds,
                };
                sqldb.query(sql.soft_delete_unused_assessment_questions_in_assessment, params, function(err) {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            });
        });
    },

    syncAssessmentQuestion: function(qid, maxPoints, pointsList, initPoints, iInAlternativeGroup, iAssessmentQuestion, assessmentId, alternative_group_id, courseInfo, callback) {
        var params = {
            qid: qid,
            course_id: courseInfo.courseId,
        };
        sqldb.query(sql.select_question_by_qid, params, function(err, result) {
            if (ERR(err, callback)) return;
            if (result.rowCount < 1) return callback(new Error('invalid QID: "' + qid + '"'));
            var questionId = result.rows[0].id;

            logger.verbose('Syncing assessment question number ' + iAssessmentQuestion + ' with QID ' + qid);
            var params = {
                number: iAssessmentQuestion,
                max_points: maxPoints,
                points_list: pointsList,
                init_points: initPoints,
                assessment_id: assessmentId,
                question_id: questionId,
                alternative_group_id: alternative_group_id,
                number_in_alternative_group: iInAlternativeGroup,
            };
            sqldb.queryOneRow(sql.insert_assessment_question, params, function(err, result) {
                if (ERR(err, callback)) return;
                callback(null, result.rows[0].id);
            });
        });
    },
};
