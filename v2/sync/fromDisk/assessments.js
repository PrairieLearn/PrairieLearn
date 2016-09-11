var ERR = require('async-stacktrace');
var _ = require('underscore');
var async = require('async');
var moment = require('moment-timezone');

var logger = require('../../logger');
var sqldb = require('../../sqldb');
var config = require('../../config');
var sqlLoader = require('../../sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

module.exports = {
    sync: function(courseInfo, courseInstance, callback) {
        var that = module.exports;
        var ids = [];
        async.series([
            function(callback) {
                async.forEachOfSeries(courseInstance.assessmentDB, function(dbAssessment, tid, callback) {
                    logger.info('Syncing ' + tid);
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
                    sqldb.query(sql.insert, params, function(err, result) {
                        if (ERR(err, callback)) return;
                        var assessmentId = result.rows[0].id;
                        ids.push(assessmentId);
                        logger.info('Synced ' + tid + ' as assessment_id ' + assessmentId);
                        that.syncAccessRules(assessmentId, dbAssessment, function(err) {
                            if (ERR(err, callback)) return;
                            if (_(dbAssessment).has('options') && _(dbAssessment.options).has('zones')) {
                                // RetryExam, new format
                                zoneList = dbAssessment.options.zones;
                            } else if (_(dbAssessment).has('options') && _(dbAssessment.options).has('questionGroups')) {
                                // RetryExam, old format
                                zoneList = [{questions: _(dbAssessment.options.questionGroups).flatten()}];
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
                // soft-delete assessments from the DB that aren't on disk and are in the current course instance
                logger.info('Soft-deleting unused assessments');
                var paramIndexes = ids.map(function(item, idx) {return "$" + (idx + 2);});
                var sql = 'WITH'
                    + ' course_instance_assessment_ids AS ('
                    + '     SELECT a.id'
                    + '     FROM assessments AS a'
                    + '     WHERE a.course_instance_id = $1'
                    + '     AND a.deleted_at IS NULL'
                    + ' )'
                    + ' UPDATE assessments SET deleted_at = CURRENT_TIMESTAMP'
                    + ' WHERE id IN (SELECT * FROM course_instance_assessment_ids)'
                    + (ids.length === 0 ? '' : ' AND id NOT IN (' + paramIndexes.join(',') + ')')
                    + ' ;';
                var params = [courseInstance.courseInstanceId].concat(ids);
                sqldb.query(sql, params, function(err) {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
            function(callback) {
                // soft-delete assessment_questions from DB that don't correspond to current assessments
                logger.info('Soft-deleting unused assessment questions');
                var paramIndexes = ids.map(function(item, idx) {return "$" + (idx + 2);});
                var sql = 'WITH'
                    + ' course_instance_assessment_question_ids AS ('
                    + '     SELECT aq.id'
                    + '     FROM assessment_questions AS aq'
                    + '     JOIN assessments AS a ON (a.id = aq.assessment_id)'
                    + '     WHERE a.course_instance_id = $1'
                    + '     AND aq.deleted_at IS NULL'
                    + ' )'
                    + ' UPDATE assessment_questions SET deleted_at = CURRENT_TIMESTAMP'
                    + ' WHERE id IN (SELECT * FROM course_instance_assessment_question_ids)'
                    + (ids.length === 0 ? '' : ' AND assessment_id NOT IN (' + paramIndexes.join(',') + ')')
                    + ' ;';
                var params = [courseInstance.courseInstanceId].concat(ids);
                sqldb.query(sql, params, function(err) {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
            function(callback) {
                // delete access rules from DB that don't correspond to assessments
                logger.info('Deleting unused assessment access rules');
                var sql = 'DELETE FROM assessment_access_rules AS tar'
                    + ' WHERE NOT EXISTS ('
                    + '     SELECT * FROM assessments AS a'
                    + '     WHERE a.id = tar.assessment_id'
                    + '     AND a.deleted_at IS NULL'
                    + ' );';
                sqldb.query(sql, [], function(err) {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
            function(callback) {
                // delete zones from DB that don't correspond to assessments
                logger.info('Deleting unused zones');
                var sql = 'DELETE FROM zones AS z'
                    + ' WHERE NOT EXISTS ('
                    + '     SELECT * FROM assessments AS a'
                    + '     WHERE a.id = z.assessment_id'
                    + '     AND a.deleted_at IS NULL'
                    + ' );';
                sqldb.query(sql, [], function(err) {
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
            var sql
                = ' INSERT INTO assessment_access_rules (assessment_id, number, mode, role, uids, start_date, end_date, credit)'
                + ' VALUES ($1::integer, $2::integer, $3::enum_mode, $4::enum_role, $5,'
                + '     $6::timestamp with time zone, $7::timestamp with time zone, $8::integer)'
                + ' ON CONFLICT (number, assessment_id) DO UPDATE'
                + ' SET'
                + '     mode = EXCLUDED.mode,'
                + '     role = EXCLUDED.role,'
                + '     uids = EXCLUDED.uids,'
                + '     start_date = EXCLUDED.start_date,'
                + '     end_date = EXCLUDED.end_date,'
                + '     credit = EXCLUDED.credit'
                + ' ;';
            var params = [
                assessmentId,
                i + 1,
                _(dbRule).has('mode') ? dbRule.mode : null,
                _(dbRule).has('role') ? dbRule.role : null,
                _(dbRule).has('uids') ? '{' + dbRule.uids.join(',') + '}' : null,  // FIXME: SQL injection
                _(dbRule).has('startDate') ? moment.tz(dbRule.startDate, config.timezone).format() : null,
                _(dbRule).has('endDate') ? moment.tz(dbRule.endDate, config.timezone).format() : null,
                _(dbRule).has('credit') ? dbRule.credit : null,
            ];
            logger.info('Syncing assessment access rule number ' + (i + 1));
            sqldb.query(sql, params, function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        }, function(err) {
            if (ERR(err, callback)) return;

            // delete access rules from the DB that aren't on disk
            logger.info('Deleting unused assessment access rules for current assessment');
            var sql = 'DELETE FROM assessment_access_rules WHERE assessment_id = $1 AND number > $2;';
            var params = [assessmentId, allowAccess.length];
            sqldb.query(sql, params, function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        });
    },

    syncZones: function(assessmentId, zoneList, callback) {
        async.forEachOfSeries(zoneList, function(dbZone, i, callback) {
            var sql
                = ' INSERT INTO zones (assessment_id, number, title)'
                + ' VALUES ($1::integer, $2::integer, $3)'
                + ' ON CONFLICT (number, assessment_id) DO UPDATE'
                + ' SET'
                + '     title = EXCLUDED.title'
                + ' ;';
            var params = [assessmentId, i + 1, dbZone.title];
            logger.info('Syncing zone number ' + (i + 1));
            sqldb.query(sql, params, function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        }, function(err) {
            if (ERR(err, callback)) return;

            // delete zones from the DB that aren't on disk
            logger.info('Deleting unused zones for current assessment');
            var sql = 'DELETE FROM zones WHERE assessment_id = $1 AND number > $2;';
            var params = [assessmentId, zoneList.length];
            sqldb.query(sql, params, function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        });
    },

    syncAssessmentQuestions: function(assessmentId, zoneList, courseInfo, callback) {
        var that = module.exports;
        var iAssessmentQuestion = 0;
        async.forEachOfSeries(zoneList, function(dbZone, iZone, callback) {
            async.eachSeries(dbZone.questions, function(dbQuestion, callback) {
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
                async.eachSeries(qids, function(qid, callback) {
                    iAssessmentQuestion++;
                    that.syncAssessmentQuestion(qid, maxPoints, pointsList, initPoints, iAssessmentQuestion,
                                          assessmentId, iZone + 1, courseInfo, callback);
                }, function(err) {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            }, function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        }, function(err) {
            if (ERR(err, callback)) return;

            // soft-delete assessment questions from the DB that aren't on disk
            logger.info('Soft-deleting unused assessment questions for current assessment');
            var sql = 'UPDATE assessment_questions SET deleted_at = CURRENT_TIMESTAMP WHERE assessment_id = $1 AND number > $2;';
            var params = [assessmentId, iAssessmentQuestion];
            sqldb.query(sql, params, function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        });
    },

    syncAssessmentQuestion: function(qid, maxPoints, pointsList, initPoints, iAssessmentQuestion, assessmentId, iZone, courseInfo, callback) {
        var sql = 'SELECT id FROM questions WHERE qid = $1 AND course_id = $2;';
        var params = [qid, courseInfo.courseId];
        sqldb.query(sql, params, function(err, result) {
            if (ERR(err, callback)) return;
            if (result.rowCount < 1) return callback(new Error('invalid QID: "' + qid + '"'));
            var questionId = result.rows[0].id;
            var sql
                = ' INSERT INTO assessment_questions'
                + '     (number, max_points, points_list, init_points, deleted_at, assessment_id, question_id, zone_id)'
                + '     (SELECT * FROM'
                + '         (VALUES ($1::integer, $2::double precision, $3::double precision[], $4::double precision,'
                + '             NULL::timestamp with time zone, $5::integer, $6::integer)) AS vals,'
                + '         (SELECT COALESCE(('
                + '             SELECT z.id'
                + '             FROM zones AS z'
                + '             JOIN assessments AS a ON (a.id = z.assessment_id)'
                + '             WHERE a.id = $5 AND z.number = $7'
                + '         ), NULL)) AS zones'
                + '     )'
                + ' ON CONFLICT (question_id, assessment_id) DO UPDATE'
                + ' SET'
                + '     number = EXCLUDED.number,'
                + '     max_points = EXCLUDED.max_points,'
                + '     points_list = EXCLUDED.points_list,'
                + '     init_points = EXCLUDED.init_points,'
                + '     deleted_at = EXCLUDED.deleted_at,'
                + '     zone_id = EXCLUDED.zone_id,'
                + '     question_id = EXCLUDED.question_id'
                + ' ;';
            var params = [iAssessmentQuestion, maxPoints, pointsList, initPoints, assessmentId, questionId, iZone];
            logger.info('Syncing assessment question number ' + iAssessmentQuestion + ' with QID ' + qid);
            sqldb.query(sql, params, function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        });
    },
};
