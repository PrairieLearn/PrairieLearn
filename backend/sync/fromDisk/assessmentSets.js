var ERR = require('async-stacktrace');
var _ = require('underscore');
var async = require('async');

var sqldb = require('../../sqldb');
var config = require('../../config');

module.exports = {
    sync: function(courseInfo, callback) {
        async.forEachOfSeries(courseInfo.assessmentSets, function(assessmentSet, i, callback) {
            var sql
                = ' INSERT INTO assessment_sets (abbrev, name, heading, color, number, course_id)'
                + ' VALUES ($1, $2, $3, $4, $5, $6)'
                + ' ON CONFLICT (name, course_id) DO UPDATE'
                + ' SET'
                + '     abbrev = EXCLUDED.abbrev,'
                + '     heading = EXCLUDED.heading,'
                + '     color = EXCLUDED.color,'
                + '     number = EXCLUDED.number'
                + ' ;';
            var params = [assessmentSet.shortName, assessmentSet.name, assessmentSet.heading, assessmentSet.color, i + 1, courseInfo.courseId];
            sqldb.query(sql, params, callback);
        }, function(err) {
            if (ERR(err, callback)) return;
            // delete assessmentSets from the DB that aren't on disk
            var sql = 'DELETE FROM assessment_sets WHERE course_id = $1 AND number > $2;';
            var params = [courseInfo.courseId, courseInfo.assessmentSets.length];
            sqldb.query(sql, params, function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        });
    },
};
