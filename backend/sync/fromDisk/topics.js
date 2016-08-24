var _ = require('underscore');
var async = require('async');

var sqldb = require('../../sqldb');
var config = require('../../config');

module.exports = {
    sync: function(courseInfo, callback) {
        var ids = []
        async.forEachOfSeries(courseInfo.topics, function(topic, i, callback) {
            var sql
                = ' INSERT INTO topics (name, number, color, course_id)'
                + ' VALUES ($1, $2, $3, $4)'
                + ' ON CONFLICT (name, course_id) DO UPDATE'
                + ' SET'
                + '     number = EXCLUDED.number,'
                + '     color = EXCLUDED.color'
                + ' RETURNING id;';
            var params = [topic.name, i + 1, topic.color, courseInfo.courseId];
            sqldb.queryOneRow(sql, params, function(err, result) {
                if (err) return callback(err);
                ids.push(result.rows[0].id);
                callback(null);
            });
        }, function(err) {
            if (err) return callback(err);

            // delete topics from the DB that aren't on disk
            var paramIndexes = ids.map(function(item, idx) {return "$" + (idx + 2);});
            var sql
                = ' DELETE FROM topics'
                + ' WHERE course_id = $1'
                + ' AND ' + (ids.length === 0 ? 'TRUE' : 'id NOT IN (' + paramIndexes.join(',') + ')')
                + ' ;';
            var params = [courseInfo.courseId].concat(ids);
            sqldb.query(sql, params, callback);
        });
    },
};
