var _ = require('underscore');
var async = require('async');

var sqldb = require('../../sqldb');
var config = require('../../config');

module.exports = {
    sync: function(courseInfo, callback) {
        async.forEachOfSeries(courseInfo.topics, function(topic, i, callback) {
            var sql
                = ' INSERT INTO topics (short_name, name, number, color, course_id)'
                + ' VALUES ($1, $2, $3, $4, $5)'
                + ' ON CONFLICT (short_name, course_id) DO UPDATE'
                + ' SET'
                + '     name = EXCLUDED.name,'
                + '     number = EXCLUDED.number,'
                + '     color = EXCLUDED.color'
                + ' ;';
            var params = [topic.shortName, topic.name, i + 1, topic.color, courseInfo.courseId];
            sqldb.query(sql, params, callback);
        }, function(err) {
            if (err) return callback(err);
            // delete topics from the DB that aren't on disk
            var sql = 'DELETE FROM topics WHERE course_id = $1 AND number > $2;';
            var params = [courseInfo.courseId, courseInfo.topics.length];
            sqldb.query(sql, params, callback);
        });
    },
};
