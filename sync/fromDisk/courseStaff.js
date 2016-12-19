var ERR = require('async-stacktrace');
var _ = require('lodash');
var async = require('async');

var logger = require('../../lib/logger');
var sqldb = require('../../lib/sqldb');
var config = require('../../lib/config');
var sqlLoader = require('../../lib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

module.exports = {
    sync: function(courseInfo, courseInstance, callback) {
        var superuserIds = [];
        var staffIds = [];
        logger.debug('Syncing Superusers');
        async.forEachOfSeries(config.roles, function(role, uid, callback) {
            if (role !== "Superuser") return callback(null);
            logger.debug('Syncing ' + uid);
            var params = {uid: uid};
            sqldb.query(sql.insert_user, params, function(err, result) {
                if (ERR(err, callback)) return;
                var userId = result.rows[0].id;
                superuserIds.push(userId);

                // Superusers get enrolled in all courseInstances of the course
                logger.debug('enrolling user into all course_instances of this course');
                var params = {
                    user_id: userId,
                    role: 'Superuser',
                    course_id: courseInfo.courseId,
                };
                sqldb.query(sql.insert_enrollment_all_course_instances, params, function(err) {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            });
        }, function(err) {
            if (ERR(err, callback)) return;
            // load Instructors and TAs
            logger.debug('Syncing Instructors and TAs');
            async.forEachOfSeries(courseInstance.userRoles || {}, function(role, uid, callback) {
                if (_(config.roles).has(uid) && config.roles[uid] == 'Superuser') return callback(null);
                if (role !== "Instructor" && role !== "TA") return callback(null);
                logger.debug('Syncing ' + uid);
                var params = {uid: uid};
                sqldb.query(sql.insert_user, params, function(err, result) {
                    if (ERR(err, callback)) return;
                    var userId = result.rows[0].id;
                    staffIds.push(userId);

                    // Instructors and TAs only get enrolled in the current courseInstance
                    var params = {
                        user_id: userId,
                        role: role,
                        course_instance_id: courseInstance.courseInstanceId,
                    };
                    sqldb.query(sql.insert_enrollment_one_course_instance, params, function(err) {
                        if (ERR(err, callback)) return;
                        callback(null);
                    });
                });
            }, function(err) {
                if (ERR(err, callback)) return;
                // reduce role to Student in the current course instance if they are not in the above list
                logger.debug('Reduce all other roles to Student');
                var params = {
                    course_instance_id: courseInstance.courseInstanceId,
                    preserve_user_ids: _.union(superuserIds, staffIds),
                };
                sqldb.query(sql.downgrade_enrollments, params, function(err) {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            });
        });
    },
};
