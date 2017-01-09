var ERR = require('async-stacktrace');
var _ = require('lodash');
var async = require('async');
var moment = require('moment-timezone');

var logger = require('../../lib/logger');
var error = require('../../lib/error');
var sqldb = require('../../lib/sqldb');
var config = require('../../lib/config');
var sqlLoader = require('../../lib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

module.exports = {
    sync: function(courseInfo, courseInstance, callback) {
        var that = module.exports;
        var assessmentIds = [];
        async.series([
            // TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP
            //   TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP
            // TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP
            //   TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP
            function(callback) {
                logger.verbose('FIXME tmp uuid assessments add');
                async.forEachOfSeries(courseInstance.assessmentDB, function(dbAssessment, tid, callback) {
                    logger.debug('FIXME set_assessment_uuid ' + tid);
                    sqldb.call('set_assessment_uuid', [courseInstance.courseInstanceId, tid, dbAssessment.uuid], function(err, result) {
                        if (ERR(err, callback)) return;
                        callback(null);
                    });
                }, function(err) {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
            // TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP
            //   TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP
            // TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP
            //   TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP
            function(callback) {
                async.forEachOfSeries(courseInstance.assessmentDB, function(dbAssessment, tid, callback) {
                    logger.debug('Checking uuid for ' + tid);
                    sqldb.call('assessments_with_uuid_elsewhere', [courseInstance.courseInstanceId, dbAssessment.uuid], function(err, result) {
                        if (ERR(err, callback)) return;
                        if (result.rowCount > 0) return callback(new Error('UUID ' + dbAssessment.uuid + ' from assessment ' + tid + ' in ' + courseInstance.tid + ' already in use in different course instance'));
                        callback(null);
                    });
                }, function(err) {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
            function(callback) {
                async.forEachOfSeries(courseInstance.assessmentDB, function(dbAssessment, tid, callback) {
                    logger.debug('Syncing ' + tid);
                    var params = {
                        tid: tid,
                        uuid: dbAssessment.uuid,
                        type: dbAssessment.type,
                        number: dbAssessment.number,
                        title: dbAssessment.title,
                        config: dbAssessment.options,
                        multiple_instance: dbAssessment.multipleInstance ? true : false,
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
                        logger.debug('Synced ' + tid + ' as assessment_id ' + assessmentId);
                        that.syncAccessRules(assessmentId, dbAssessment, function(err) {
                            that.syncZones(assessmentId, dbAssessment, function(err) {
                                if (ERR(err, callback)) return;
                                that.syncAssessmentQuestions(assessmentId, dbAssessment, courseInfo, function(err) {
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
                logger.debug('Soft-deleting unused assessments');
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
                logger.debug('Soft-deleting unused assessment questions');
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
                logger.debug('Deleting unused assessment access rules');
                sqldb.query(sql.delete_unused_assessment_access_rules, [], function(err) {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
            function(callback) {
                logger.debug('Deleting unused zones');
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
            logger.debug('Syncing assessment access rule number ' + (i + 1));
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

            logger.debug('Deleting excess assessment access rules for current assessment');
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

    syncZones: function(assessmentId, dbAssessment, callback) {
        var zoneList = dbAssessment.zones || [];
        async.forEachOfSeries(zoneList, function(dbZone, i, callback) {
            logger.debug('Syncing zone number ' + (i + 1));
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

            logger.debug('Deleting excess zones for current assessment');
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

    syncAssessmentQuestions: function(assessmentId, dbAssessment, courseInfo, callback) {
        var that = module.exports;
        var zoneList = dbAssessment.zones || [];
        var iAssessmentQuestion = 0;
        var iInAlternativeGroup;
        var iAlternativeGroup = 0;
        var assessmentQuestionIds = [];
        async.forEachOfSeries(zoneList, function(dbZone, iZone, callback) {
            async.forEachOfSeries(dbZone.questions, function(dbQuestion, iQuestion, callback) {
                var alternatives;
                if (_(dbQuestion).has('alternatives')) {
                    if (_(dbQuestion).has('id')) return callback(error.make(400, 'Cannot have both "id" and "alternatives" in one question', {dbQuestion}));
                    alternatives = _.map(dbQuestion.alternatives, function(question) {
                        return {
                            qid: question.id,
                            maxPoints: question.maxPoints || dbQuestion.maxPoints,
                            points: question.points || dbQuestion.points,
                        };
                    });
                } else if (_(dbQuestion).has('id')) {
                    alternatives = [
                        {
                            qid: dbQuestion.id,
                            maxPoints: dbQuestion.maxPoints,
                            points: dbQuestion.points,
                        }
                    ];
                } else {
                    return callback(error.make(400, 'Must specify either "id" or "alternatives" in question', {dbQuestion}));
                }

                for (var i = 0; i < alternatives.length; i++) {
                    var question = alternatives[i];
                    if (dbAssessment.type == 'Exam') {
                        if (question.maxPoints != undefined) {
                            return callback(error.make(400, 'Cannot specify "maxPoints" for a question in an "Exam" assessment',
                                                       {dbQuestion}));
                        }
                        if (question.points == undefined) {
                            return callback(error.make(400, 'Must specifiy "points" for a question in an "Exam" assessment',
                                                       {dbQuestion}));
                        }
                        if (_.isArray(question.points)) {
                            question.pointsList = question.points;
                        } else {
                            question.pointsList = [question.points];
                        }
                        delete question.points;
                        question.maxPoints = _.max(question.pointsList);
                    }
                    if (dbAssessment.type == 'Homework') {
                        if (question.points == undefined) {
                            return callback(error.make(400, 'Must specifiy "points" for a question in a "Homework" assessment',
                                                       {dbQuestion}));
                        }
                        if (_.isArray(question.points)) {
                            return callback(error.make(400, 'Cannot specify "points" as a list for a question in'
                                                       + ' a "Homework" assessment', {dbQuestion}));
                        }
                        if (question.maxPoints == undefined) {
                            question.maxPoints = question.points;
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

            logger.debug('Deleting excess alternative groups for current assessment');
            var params = {
                assessment_id: assessmentId,
                last_number: iAlternativeGroup,
            };
            sqldb.query(sql.delete_excess_alternative_groups, params, function(err, result) {
                if (ERR(err, callback)) return;

                logger.debug('Soft-deleting unused assessment questions for current assessment');
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

            logger.debug('Syncing assessment question number ' + iAssessmentQuestion + ' with QID ' + qid);
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
