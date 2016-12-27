var ERR = require('async-stacktrace');
var _ = require('lodash');
var async = require('async');

var logger = require('../../lib/logger');
var sqldb = require('../../lib/sqldb');
var config = require('../../lib/config');
var sqlLoader = require('../../lib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

module.exports = {
    sync: function(courseInfo, questionDB, callback) {
        var questionIds = [];
        logger.debug('Syncing questions');
        async.series([
            // TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP
            //   TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP
            // TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP
            //   TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP
            function(callback) {
                logger.verbose('FIXME tmp uuid questions add');
                async.forEachOfSeries(questionDB, function(q, qid, callback) {
                    logger.debug('FIXME tmp uuid question add ' + qid);
                    sqldb.call('set_question_uuid', [courseInfo.courseId, qid, q.uuid], function(err, result) {
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
                async.forEachOfSeries(questionDB, function(q, qid, callback) {
                    logger.debug('Syncing question ' + qid);
                    var params = {
                        uuid: q.uuid,
                        qid: qid,
                        type: q.type,
                        title: q.title,
                        config: q.config,
                        client_files: q.clientFiles || [],
                        course_id: courseInfo.courseId,
                        topic: q.topic,
                        grading_method: q.gradingMethod || 'Internal',
                    };
                    sqldb.queryOneRow(sql.insert_question, params, function(err, result) {
                        if (ERR(err, callback)) return;
                        q.id = result.rows[0].id;
                        questionIds.push(result.rows[0].id);
                        callback(null);
                    });
                }, function(err) {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
            function(callback) {
                // soft-delete questions from the DB that aren't on disk
                logger.debug('Soft-deleting unused questions');
                var params = {
                    course_id: courseInfo.courseId,
                    keep_question_ids: questionIds,
                };
                sqldb.query(sql.soft_delete_unused_questions, params, function(err) {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
            function(callback) {
                var params = {course_id: courseInfo.courseId};
                sqldb.query(sql.ensure_numbers, params, function(err) {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
        ], function(err) {
            if (ERR(err, callback)) return;
            callback(null);
        });
    },
};
