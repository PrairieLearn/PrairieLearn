var _ = require('underscore');
var path = require('path');
var async = require('async');

var config = require('../../config');
var sqldb = require('../../sqldb');
var sqlLoader = require('../../sql-loader');

var sql = sqlLoader.load(path.join(__dirname, 'courseInstances.sql'));

module.exports = {
    sync: function(courseInfo, courseInstanceDB, callback) {
        var courseInstanceIds = [];
        async.forEachOfSeries(courseInstanceDB, function(courseInstance, courseInstanceShortName, callback) {
            var params = [courseInfo.courseId, courseInstanceShortName, courseInstance.longName,
                          courseInstance.number, courseInstance.startDate, courseInstance.endDate];
            sqldb.query(sql.all, params, function(err, result) {
                if (err) return callback(err);
                var courseInstanceId = result.rows[0].id;
                courseInstanceIds.push(courseInstanceId);
                courseInstance.courseInstanceId = courseInstanceId;
                callback(null);
            })
        }, function(err) {
            if (err) return callback(err);
            // soft-delete courseInstances from the DB that aren't on disk
            var paramIndexes = courseInstanceIds.map(function(item, idx) {return "$" + (idx + 2);});
            var sql = 'WITH'
                + ' course_instance_ids AS ('
                + '     SELECT id'
                + '     FROM course_instances'
                + '     WHERE course_id = $1'
                + '     AND deleted_at IS NULL'
                + ' )'
                + ' UPDATE course_instances SET deleted_at = CURRENT_TIMESTAMP'
                + ' WHERE id IN (SELECT * FROM course_instance_ids)'
                + ' AND ' + (courseInstanceIds.length === 0 ? 'TRUE' : 'id NOT IN (' + paramIndexes.join(',') + ')')
                + ' ;';
            var params = [courseInfo.courseId].concat(courseInstanceIds);
            sqldb.query(sql, params, callback);
        });
    },
};
