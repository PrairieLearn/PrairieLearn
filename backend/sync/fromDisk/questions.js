var _ = require('underscore');
var async = require('async');

var sqldb = require('../../sqldb');
var config = require('../../config');

module.exports = {
    sync: function(courseInfo, questionDB, callback) {
        var questionIds = [];
        async.forEachOfSeries(questionDB, function(q, qid, callback) {
            var sql
                = ' INSERT INTO questions (qid, directory, type, title, config, course_id, deleted_at, topic_id)'
                + '     (SELECT * FROM'
                + '         (VALUES ($1, $1, $2::enum_question_type, $3, $4::JSONB, $5::integer, NULL::timestamp with time zone)) AS vals,'
                + '         (SELECT COALESCE((SELECT id FROM topics WHERE name = $6 AND course_id = $5), NULL)) AS topics'
                + '     )'
                + ' ON CONFLICT (qid, course_id) DO UPDATE'
                + ' SET'
                + '     directory = EXCLUDED.directory,'
                + '     type = EXCLUDED.type,'
                + '     title = EXCLUDED.title,'
                + '     config = EXCLUDED.config,'
                + '     topic_id = EXCLUDED.topic_id,'
                + '     deleted_at = EXCLUDED.deleted_at'
                + ' RETURNING id;';
            var params = [qid, q.type, q.title, q.config, courseInfo.courseId, q.topic];
            sqldb.queryOneRow(sql, params, function(err, result) {
                if (err) return callback(err);
                q.id = result.rows[0].id;
                questionIds.push(result.rows[0].id);
                callback(null);
            });
        }, function(err) {
            if (err) return callback(err);
            // soft-delete questions from the DB that aren't on disk
            var paramIndexes = questionIds.map(function(item, idx) {return "$" + (idx + 2);});
            var sql = 'WITH'
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
            sqldb.query(sql, params, callback);
        });
    },
};
