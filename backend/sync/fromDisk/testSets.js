var _ = require('underscore');
var async = require('async');

var sqldb = require('../../sqldb');
var config = require('../../config');

module.exports = {
    sync: function(courseInfo, callback) {
        async.forEachOfSeries(courseInfo.testSets, function(testSet, i, callback) {
            var sql
                = ' INSERT INTO test_sets (abbrev, name, heading, color, number, course_id)'
                + ' VALUES ($1, $2, $3, $4, $5, $6)'
                + ' ON CONFLICT (name, course_id) DO UPDATE'
                + ' SET'
                + '     abbrev = EXCLUDED.abbrev,'
                + '     heading = EXCLUDED.heading,'
                + '     color = EXCLUDED.color,'
                + '     number = EXCLUDED.number'
                + ' ;';
            var params = [testSet.shortName, testSet.name, testSet.heading, testSet.color, i + 1, courseInfo.courseId];
            sqldb.query(sql, params, callback);
        }, function(err) {
            if (err) return callback(err);
            // delete testSets from the DB that aren't on disk
            var sql = 'DELETE FROM test_sets WHERE course_id = $1 AND number > $2;';
            var params = [courseInfo.courseId, courseInfo.testSets.length];
            sqldb.query(sql, params, callback);
        });
    },
};
