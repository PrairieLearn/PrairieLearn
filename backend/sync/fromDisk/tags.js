var _ = require('lodash');
var async = require('async');

var sqldb = require('../../sqldb');
var config = require('../../config');

module.exports = {
    sync: function(courseInfo, questionDB, callback) {
        async.series([
            function(callback) {
                courseInfo.tags = courseInfo.tags || [];
                var ids = [];
                async.forEachOfSeries(courseInfo.tags, function(tag, i, callback) {
                    var sql
                        = ' INSERT INTO tags (name, number, color, course_id)'
                        + ' VALUES ($1, $2, $3, $4)'
                        + ' ON CONFLICT (name, course_id) DO UPDATE'
                        + ' SET'
                        + '     number = EXCLUDED.number,'
                        + '     color = EXCLUDED.color'
                        + ' RETURNING id;';
                    var params = [tag.name, i + 1, tag.color, courseInfo.courseId];
                    sqldb.query(sql, params, function(err, result) {
                        if (err) return callback(err);
                        tag.id = result.rows[0].id;
                        ids.push(tag.id);
                        callback(null);
                    });
                }, function(err) {
                    if (err) return callback(err);

                    // delete topics from the DB that aren't on disk
                    var paramIndexes = ids.map(function(item, idx) {return "$" + (idx + 2);});
                    var sql
                        = ' DELETE FROM tags'
                        + ' WHERE course_id = $1'
                        + ' AND ' + (ids.length === 0 ? 'TRUE' : 'id NOT IN (' + paramIndexes.join(',') + ')')
                        + ' ;';
                    var params = [courseInfo.courseId].concat(ids);
                    sqldb.query(sql, params, callback);
                });
            },
            function(callback) {
                var tagsByName = _.keyBy(courseInfo.tags, 'name');
                async.forEachOfSeries(questionDB, function(q, qid, callback) {
                    q.tags = q.tags || [];
                    var ids = [];
                    async.forEachOfSeries(q.tags, function(tagName, i, callback) {
                        var sql
                            = ' INSERT INTO question_tags (question_id, tag_id, number)'
                            + ' VALUES ($1, $2, $3)'
                            + ' ON CONFLICT (question_id, tag_id) DO UPDATE'
                            + ' SET number = EXCLUDED.number'
                            + ' RETURNING id;'
                        if (!_(tagsByName).has(tagName)) {
                            return callback(new Error('Question ' + qid + ', unknown tag: ' + tagName));
                        }
                        var params = [q.id, tagsByName[tagName].id, i + 1];
                        sqldb.query(sql, params, function(err, result) {
                            if (err) return callback(err);
                            ids.push(result.rows[0].id);
                            callback(null);
                        });
                    }, function(err) {
                        if (err) return callback(err);

                        // delete topics from the DB that aren't on disk
                        var paramIndexes = ids.map(function(item, idx) {return "$" + (idx + 2);});
                        var sql
                            = ' DELETE FROM question_tags'
                            + ' WHERE question_id = $1'
                            + ' AND ' + (ids.length === 0 ? 'TRUE' : 'id NOT IN (' + paramIndexes.join(',') + ')')
                            + ' ;';
                        var params = [q.id].concat(ids);
                        sqldb.query(sql, params, callback);
                    });
                }, callback);
            },
        ], callback);
    },
};
