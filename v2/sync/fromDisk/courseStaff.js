var ERR = require('async-stacktrace');
var _ = require('underscore');
var async = require('async');

var sqldb = require('../../sqldb');
var config = require('../../config');

module.exports = {
    sync: function(courseInfo, courseInstance, callback) {
        var superuserIds = [];
        var staffIds = [];
        async.forEachOfSeries(config.roles, function(role, uid, callback) {
            if (role !== "Superuser") return callback(null);
            var sql
                = ' INSERT INTO users (uid) VALUES ($1)'
                + ' ON CONFLICT (uid) DO UPDATE SET uid = users.uid' // re-set uid to force row to be returned
                + ' RETURNING *'
                + ' ;';
            var params = [uid];
            sqldb.query(sql, params, function(err, result) {
                if (ERR(err, callback)) return;
                var userId = result.rows[0].id;
                superuserIds.push(userId);

                // Superusers get enrolled in all courseInstances of the course
                var sql
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
                var params = [userId, 'Superuser', courseInfo.courseId];
                sqldb.query(sql, params, function(err) {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            });
        }, function(err) {
            if (ERR(err, callback)) return;
            // load Instructors and TAs
            async.forEachOfSeries(courseInstance.userRoles || {}, function(role, uid, callback) {
                if (_(config.roles).has(uid) && config.roles[uid] == 'Superuser') return callback(null);
                if (role !== "Instructor" && role !== "TA") return callback(null);
                var sql
                    = ' INSERT INTO users (uid) VALUES ($1)'
                    + ' ON CONFLICT (uid) DO UPDATE SET uid = users.uid'
                    + ' RETURNING *'
                    + ' ;';
                var params = [uid];
                sqldb.query(sql, params, function(err, result) {
                    if (ERR(err, callback)) return;
                    var userId = result.rows[0].id;
                    staffIds.push(userId);

                    // Instructors and TAs only get enrolled in the current courseInstance
                    var sql
                        = ' INSERT INTO enrollments'
                        + ' (user_id,role,course_instance_id)'
                        + ' VALUES ($1, $2, $3)'
                        + ' ON CONFLICT (user_id,course_instance_id)'
                        + ' DO UPDATE SET role = EXCLUDED.role'
                        + ' ;';
                    var params = [userId, role, courseInstance.courseInstanceId];
                    sqldb.query(sql, params, function(err) {
                        if (ERR(err, callback)) return;
                        callback(null);
                    });
                });
            }, function(err) {
                if (ERR(err, callback)) return;
                // reduce role to Student in the current course instance if they are not in the above list
                var allIds = _.union(superuserIds, staffIds);
                var paramIndexes = allIds.map(function(item, idx) {return "$" + (idx + 2);});
                var sql
                    = ' UPDATE enrollments AS e SET role = \'Student\''
                    + ' WHERE EXISTS('
                    + '     SELECT * FROM users AS u'
                    + '     JOIN course_instances AS ci ON (ci.id = e.course_instance_id)'
                    + '     WHERE u.id = e.user_id'
                    + '     AND ci.id = $1'
                    + '     AND e.role != \'Student\'::enum_role'
                    + '     AND ' + (allIds.length === 0 ? 'TRUE' : 'u.id NOT IN (' + paramIndexes.join(',') + ')')
                    + ' )'
                    + ' ;';
                var params = [courseInstance.courseInstanceId].concat(allIds);
                sqldb.query(sql, params, function(err) {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            });
        });
    },
};
