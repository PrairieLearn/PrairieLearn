var _ = require('underscore');
var async = require('async');
var requireFrontend = require("../../require-frontend");
var PrairieRole = requireFrontend('PrairieRole');

var sqldb = require('../../sqldb');
var config = require('../../config');

var upsertEnrollmentsToCourseSQL
    = ' INSERT INTO enrollments'
    + ' (role,user_id,course_instance_id)'
    + ' ('
    + '     SELECT nu.role,nu.user_id,ci.id'
    + '     FROM course_instances AS ci,'
    + '     (VALUES ($1::integer,$2::enum_role))'
    + '     AS nu (user_id,role)'
    + '     WHERE course_id = $3'
    + ' )'
    + ' ON CONFLICT (user_id,course_instance_id)'
    + ' DO UPDATE SET role = EXCLUDED.role'
    + ' WHERE EXCLUDED.role != enrollments.role'
    + ' ;';

module.exports = {
    sync: function(courseInfo, callback) {
        var superuserIds = [];
        var instructorIds = [];
        var taIds = [];
        async.forEachOfSeries(config.roles, function(role, uid, callback) {
            if (role !== "Superuser") return callback(null);
            // Superusers get enrolled in all courseInstances of the course
            var sql
                = ' INSERT INTO users (uid) VALUES ($1)'
                + ' ON CONFLICT (uid) DO UPDATE SET uid = users.uid' // re-set uid to force row to be returned
                + ' RETURNING *'
                + ' ;';
            var params = [uid];
            sqldb.query(sql, params, function(err, result) {
                if (err) return callback(err);
                var userId = result.rows[0].id;
                superuserIds.push(userId);
                var params = [userId, 'Superuser', courseInfo.courseId];
                sqldb.query(upsertEnrollmentsToCourseSQL, params, function(err, result) {
                    if (err) return callback(err);
                    callback(null);
                });
            });
        }, function(err) {
            if (err) return callback(err);
            // load Instructors and TAs from courseInfo
            async.forEachOfSeries(courseInfo.userRoles || {}, function(role, uid, callback) {
                if (role !== "Instructor" && role !== "TA") return callback(null);
                var sql
                    = ' INSERT INTO users (uid) VALUES ($1)'
                    + ' ON CONFLICT (uid) DO UPDATE SET uid = users.uid'
                    + ' RETURNING *'
                    + ' ;';
                var params = [uid];
                sqldb.query(sql, params, function(err, result) {
                    if (err) return callback(err);
                    var userId = result.rows[0].id;
                    if (role == "Instructor") {
                        instructorIds.push(userId);
                        // Instructors get enrolled in all courseInstances of the course
                        var params = [userId, 'Superuser', courseInfo.courseId];
                        sqldb.query(upsertEnrollmentsToCourseSQL, params, function(err, result) {
                            if (err) return callback(err);
                            callback(null);
                        });
                    } else if (role == "TA") {
                        taIds.push(userId);
                        // TAs only get enrolled in the current courseInstance
                        var sql
                            = ' INSERT INTO enrollments'
                            + ' (role,user_id,course_instance_id)'
                            + ' VALUES (\'TA\', $1, $2)'
                            + ' ON CONFLICT (user_id,course_instance_id)'
                            + ' DO UPDATE SET role = EXCLUDED.role'
                            + ' ;';
                        var params = [userId, courseInfo.courseInstanceId];
                        sqldb.query(sql, params, function(err, result) {
                            if (err) return callback(err);
                            callback(null);
                        });
                    }
                });
            }, function(err) {
                if (err) return callback(err);
                // reduce Superuser/Instructors to Students in the current course if they are not in the above list
                var siIds = _.union(superuserIds, instructorIds);
                var paramIdxes = siIds.map(function(item, idx) {return "$" + (idx + 2);});
                var sql
                    = ' UPDATE enrollments AS e SET role = \'Student\''
                    + ' WHERE EXISTS('
                    + '     SELECT * FROM users AS u'
                    + '     JOIN course_instances AS ci ON (ci.id = e.course_instance_id)'
                    + '     JOIN courses AS c ON (c.id = ci.course_id)'
                    + '     WHERE u.id = e.user_id'
                    + '     AND c.id = $1'
                    + '     AND e.role IN (\'Superuser\'::enum_role, \'Instructor\'::enum_role)'
                    + '     AND ' + (siIds.length === 0 ? 'TRUE' : 'u.id NOT IN (' + paramIdxes.join(',') + ')')
                    + ' )'
                    + ' ;';
                var params = [courseInfo.courseId].concat(siIds);
                sqldb.query(sql, params, function(err, result) {
                    if (err) return callback(err);
                    // reduce TAs to Students in the current course if they are not in the above list or not in the current courseInstance
                    var paramIdxes = taIds.map(function(item, idx) {return "$" + (idx + 3);});
                    var sql
                        = ' UPDATE enrollments AS e SET role = \'Student\''
                        + ' WHERE EXISTS('
                        + '     SELECT * FROM users AS u'
                        + '     JOIN course_instances AS ci ON (ci.id = e.course_instance_id)'
                        + '     JOIN courses AS c ON (c.id = ci.course_id)'
                        + '     WHERE u.id = e.user_id'
                        + '     AND c.id = $1'
                        + '     AND e.role = \'TA\'::enum_role'
                        + '     AND ('
                        + '         ci.id != $2'
                        + '     OR ' + (taIds.length === 0 ? 'TRUE' : 'u.id NOT IN (' + paramIdxes.join(',') + ')')
                        + '     )'
                        + ' )'
                        + ' ;';
                    var params = [courseInfo.courseId, courseInfo.courseInstanceId].concat(taIds);
                    sqldb.query(sql, params, function(err, result) {
                        if (err) return callback(err);
                        callback(null);
                    });
                });
            });
        });
    },
};
