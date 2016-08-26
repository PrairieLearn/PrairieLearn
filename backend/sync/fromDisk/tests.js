var _ = require('underscore');
var async = require('async');
var moment = require('moment-timezone');

var logger = require('../../logger');
var sqldb = require('../../sqldb');
var config = require('../../config');

module.exports = {
    sync: function(courseInfo, courseInstance, callback) {
        var that = module.exports;
        var ids = [];
        async.series([
            function(callback) {
                async.forEachOfSeries(courseInstance.testDB, function(dbTest, tid, callback) {
                    logger.info('Syncing ' + tid);
                    var sql
                        = ' INSERT INTO tests (tid, type, number, title, config, multiple_instance, max_points, deleted_at, course_instance_id, test_set_id)'
                        + '     (SELECT * FROM'
                        + '         (VALUES ($1, $2::enum_test_type, $3, $4, $5::JSONB, $6::BOOLEAN, $7::DOUBLE PRECISION, NULL::timestamp with time zone, $8::INTEGER)) AS vals,'
                        + '         (SELECT COALESCE((SELECT id FROM test_sets WHERE name = $10 AND course_id = $9), NULL)) AS test_sets'
                        + '     )'
                        + ' ON CONFLICT (tid, course_instance_id) DO UPDATE'
                        + ' SET'
                        + '     type = EXCLUDED.type,'
                        + '     number = EXCLUDED.number,'
                        + '     title = EXCLUDED.title,'
                        + '     config = EXCLUDED.config,'
                        + '     multiple_instance = EXCLUDED.multiple_instance,'
                        + '     max_points = EXCLUDED.max_points,'
                        + '     deleted_at = EXCLUDED.deleted_at,'
                        + '     test_set_id = EXCLUDED.test_set_id'
                        + ' RETURNING id;';
                    var params = [tid, dbTest.type, dbTest.number, dbTest.title, dbTest.options,
                                  dbTest.options && dbTest.options.multipleInstance ? true : false,
                                  dbTest.options ? dbTest.options.maxScore : null,
                                  courseInstance.courseInstanceId, courseInfo.courseId, dbTest.set];
                    sqldb.query(sql, params, function(err, result) {
                        if (err) return callback(err);
                        var testId = result.rows[0].id;
                        ids.push(testId);
                        logger.info('Synced ' + tid + ' as test_id ' + testId);
                        that.syncAccessRules(testId, dbTest, function(err) {
                            if (err) return callback(err);
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
                            that.syncZones(testId, zoneList, function(err) {
                                if (err) return callback(err);
                                that.syncTestQuestions(testId, zoneList, courseInfo, callback);
                            });
                        });
                    });
                }, callback);
            },
            function(callback) {
                // soft-delete tests from the DB that aren't on disk and are in the current course instance
                logger.info('Soft-deleting unused tests');
                var paramIndexes = ids.map(function(item, idx) {return "$" + (idx + 2);});
                var sql = 'WITH'
                    + ' course_instance_test_ids AS ('
                    + '     SELECT t.id'
                    + '     FROM tests AS t'
                    + '     WHERE t.course_instance_id = $1'
                    + '     AND t.deleted_at IS NULL'
                    + ' )'
                    + ' UPDATE tests SET deleted_at = CURRENT_TIMESTAMP'
                    + ' WHERE id IN (SELECT * FROM course_instance_test_ids)'
                    + (ids.length === 0 ? '' : ' AND id NOT IN (' + paramIndexes.join(',') + ')')
                    + ' ;';
                var params = [courseInstance.courseInstanceId].concat(ids);
                sqldb.query(sql, params, callback);
            },
            function(callback) {
                // soft-delete test_questions from DB that don't correspond to current tests
                logger.info('Soft-deleting unused test questions');
                var paramIndexes = ids.map(function(item, idx) {return "$" + (idx + 2);});
                var sql = 'WITH'
                    + ' course_instance_test_question_ids AS ('
                    + '     SELECT tq.id'
                    + '     FROM test_questions AS tq'
                    + '     JOIN tests AS t ON (t.id = tq.test_id)'
                    + '     WHERE t.course_instance_id = $1'
                    + '     AND tq.deleted_at IS NULL'
                    + ' )'
                    + ' UPDATE test_questions SET deleted_at = CURRENT_TIMESTAMP'
                    + ' WHERE id IN (SELECT * FROM course_instance_test_question_ids)'
                    + (ids.length === 0 ? '' : ' AND test_id NOT IN (' + paramIndexes.join(',') + ')')
                    + ' ;';
                var params = [courseInstance.courseInstanceId].concat(ids);
                sqldb.query(sql, params, callback);
            },
            function(callback) {
                // delete access rules from DB that don't correspond to tests
                logger.info('Deleting unused test access rules');
                var sql = 'DELETE FROM test_access_rules AS tar'
                    + ' WHERE NOT EXISTS ('
                    + '     SELECT * FROM tests AS t'
                    + '     WHERE t.id = tar.test_id'
                    + '     AND t.deleted_at IS NULL'
                    + ' );';
                sqldb.query(sql, [], callback);
            },
            function(callback) {
                // delete zones from DB that don't correspond to tests
                logger.info('Deleting unused zones');
                var sql = 'DELETE FROM zones AS z'
                    + ' WHERE NOT EXISTS ('
                    + '     SELECT * FROM tests AS t'
                    + '     WHERE t.id = z.test_id'
                    + '     AND t.deleted_at IS NULL'
                    + ' );';
                sqldb.query(sql, [], callback);
            },
        ], callback);
    },

    syncAccessRules: function(testId, dbTest, callback) {
        var allowAccess = dbTest.allowAccess || [];
        async.forEachOfSeries(allowAccess, function(dbRule, i, callback) {
            var sql
                = ' INSERT INTO test_access_rules (test_id, number, mode, role, uids, start_date, end_date, credit)'
                + ' VALUES ($1::integer, $2::integer, $3::enum_mode, $4::enum_role, $5,'
                + '     $6::timestamp with time zone, $7::timestamp with time zone, $8::integer)'
                + ' ON CONFLICT (number, test_id) DO UPDATE'
                + ' SET'
                + '     mode = EXCLUDED.mode,'
                + '     role = EXCLUDED.role,'
                + '     uids = EXCLUDED.uids,'
                + '     start_date = EXCLUDED.start_date,'
                + '     end_date = EXCLUDED.end_date,'
                + '     credit = EXCLUDED.credit'
                + ' ;';
            var params = [
                testId,
                i + 1,
                _(dbRule).has('mode') ? dbRule.mode : null,
                _(dbRule).has('role') ? dbRule.role : null,
                _(dbRule).has('uids') ? '{' + dbRule.uids.join(',') + '}' : null,  // FIXME: SQL injection
                _(dbRule).has('startDate') ? moment.tz(dbRule.startDate, config.timezone).format() : null,
                _(dbRule).has('endDate') ? moment.tz(dbRule.endDate, config.timezone).format() : null,
                _(dbRule).has('credit') ? dbRule.credit : null,
            ];
            logger.info('Syncing test access rule number ' + (i + 1));
            sqldb.query(sql, params, callback);
        }, function(err) {
            if (err) return callback(err);

            // delete access rules from the DB that aren't on disk
            logger.info('Deleting unused test access rules for current test');
            var sql = 'DELETE FROM test_access_rules WHERE test_id = $1 AND number > $2;';
            var params = [testId, allowAccess.length];
            sqldb.query(sql, params, callback);
        });
    },

    syncZones: function(testId, zoneList, callback) {
        async.forEachOfSeries(zoneList, function(dbZone, i, callback) {
            var sql
                = ' INSERT INTO zones (test_id, number, title)'
                + ' VALUES ($1::integer, $2::integer, $3)'
                + ' ON CONFLICT (number, test_id) DO UPDATE'
                + ' SET'
                + '     title = EXCLUDED.title'
                + ' ;';
            var params = [testId, i + 1, dbZone.title];
            logger.info('Syncing zone number ' + (i + 1));
            sqldb.query(sql, params, callback);
        }, function(err) {
            if (err) return callback(err);

            // delete zones from the DB that aren't on disk
            logger.info('Deleting unused zones for current test');
            var sql = 'DELETE FROM zones WHERE test_id = $1 AND number > $2;';
            var params = [testId, zoneList.length];
            sqldb.query(sql, params, callback);
        });
    },

    syncTestQuestions: function(testId, zoneList, courseInfo, callback) {
        var that = module.exports;
        var iTestQuestion = 0;
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
                    iTestQuestion++;
                    that.syncTestQuestion(qid, maxPoints, pointsList, initPoints, iTestQuestion,
                                          testId, iZone + 1, courseInfo, callback);
                }, callback);
            }, callback);
        }, function(err) {
            if (err) return callback(err);

            // soft-delete test questions from the DB that aren't on disk
            logger.info('Soft-deleting unused test questions for current test');
            var sql = 'UPDATE test_questions SET deleted_at = CURRENT_TIMESTAMP WHERE test_id = $1 AND number > $2;';
            var params = [testId, iTestQuestion];
            sqldb.query(sql, params, callback);
        });
    },

    syncTestQuestion: function(qid, maxPoints, pointsList, initPoints, iTestQuestion, testId, iZone, courseInfo, callback) {
        var sql = 'SELECT id FROM questions WHERE qid = $1 AND course_id = $2;';
        var params = [qid, courseInfo.courseId];
        sqldb.query(sql, params, function(err, result) {
            if (err) return callback(err);
            if (result.rowCount < 1) return callback(new Error('invalid QID: "' + qid + '"'));
            var questionId = result.rows[0].id;
            var sql
                = ' INSERT INTO test_questions'
                + '     (number, max_points, points_list, init_points, deleted_at, test_id, question_id, zone_id)'
                + '     (SELECT * FROM'
                + '         (VALUES ($1::integer, $2::double precision, $3::double precision[], $4::double precision,'
                + '             NULL::timestamp with time zone, $5::integer, $6::integer)) AS vals,'
                + '         (SELECT COALESCE(('
                + '             SELECT z.id'
                + '             FROM zones AS z'
                + '             JOIN tests AS t ON (t.id = z.test_id)'
                + '             WHERE t.id = $5 AND z.number = $7'
                + '         ), NULL)) AS zones'
                + '     )'
                + ' ON CONFLICT (question_id, test_id) DO UPDATE'
                + ' SET'
                + '     number = EXCLUDED.number,'
                + '     max_points = EXCLUDED.max_points,'
                + '     points_list = EXCLUDED.points_list,'
                + '     init_points = EXCLUDED.init_points,'
                + '     deleted_at = EXCLUDED.deleted_at,'
                + '     zone_id = EXCLUDED.zone_id,'
                + '     question_id = EXCLUDED.question_id'
                + ' ;';
            var params = [iTestQuestion, maxPoints, pointsList, initPoints, testId, questionId, iZone];
            logger.info('Syncing test question number ' + iTestQuestion + ' with QID ' + qid);
            sqldb.query(sql, params, callback);
        });
    },
};
