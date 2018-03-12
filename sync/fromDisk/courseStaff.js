var ERR = require('async-stacktrace');
var _ = require('lodash');
var async = require('async');

var logger = require('../../lib/logger');
var sqldb = require('@prairielearn/prairielib/sql-db');
var config = require('../../lib/config');
var sqlLoader = require('@prairielearn/prairielib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

module.exports = {
    sync: function(courseInfo, courseInstance, callback) {
        var staffIds = [];
        // load Instructors and TAs
        logger.debug('Syncing Instructors and TAs');
        const userRoles = courseInstance.userRoles || {};
        if (config.devMode) {
            // Make the dev user an instructor
            userRoles['dev@illinois.edu'] = 'Instructor';
        }
        async.forEachOfSeries(userRoles, function(role, uid, callback) {
            if (role !== "Instructor" && role !== "TA") return callback(null);
            logger.debug('Syncing ' + uid);
            var params = {uid: uid};
            sqldb.query(sql.insert_user, params, function(err, result) {
                if (ERR(err, callback)) return;
                var userId = result.rows[0].user_id;
                staffIds.push(userId);

                // Instructors and TAs only get enrolled in the current courseInstance
                var params = {
                    user_id: userId,
                    role: role,
                    course_instance_id: courseInstance.courseInstanceId,
                };
                sqldb.query(sql.insert_enrollment_one_course_instance, params, function(err, _result) {
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
                preserve_user_ids: staffIds,
            };
            sqldb.query(sql.downgrade_enrollments, params, function(err, _result) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        });
    },
};
