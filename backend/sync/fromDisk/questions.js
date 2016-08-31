var ERR = require('async-stacktrace');
var _ = require('underscore');
var async = require('async');

var sqldb = require('../../sqldb');
var config = require('../../config');
var sqlLoader = require('../../sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

module.exports = {
    sync: function(courseInfo, questionDB, callback) {
        var questionIds = [];
        async.forEachOfSeries(questionDB, function(q, qid, callback) {
            var params = {
                qid: qid,
                type: q.type,
                title: q.title,
                config: q.config,
                course_id: courseInfo.courseId,
                topic: q.topic,
            };
            sqldb.queryOneRow(sql.insert, params, function(err, result) {
                if (ERR(err, callback)) return;
                q.id = result.rows[0].id;
                questionIds.push(result.rows[0].id);
                callback(null);
            });
        }, function(err) {
            if (ERR(err, callback)) return;

            // soft-delete questions from the DB that aren't on disk
            var paramIndexes = questionIds.map(function(item, idx) {return "$" + (idx + 2);});
            var localSql = 'WITH'
                + ' course_question_ids AS ('
                + '     SELECT id'
                + '     FROM questions'
                + '     WHERE course_id = $1'
                + '     AND deleted_at IS NULL'
                + ' )'
                + ' UPDATE questions SET deleted_at = CURRENT_TIMESTAMP'
                + ' WHERE id IN (SELECT * FROM course_question_ids)'
                + ' AND ' + (questionIds.length === 0 ? 'TRUE' : 'id NOT IN (' + paramIndexes.join(',') + ')')
                + ' ;';
            var params = [courseInfo.courseId].concat(questionIds);
            sqldb.query(localSql, params, function(err) {
                if (ERR(err, callback)) return;

                var params = {course_id: courseInfo.courseId};
                sqldb.query(sql.ensure_numbers, params, function(err) {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            });
        });
    },
};
