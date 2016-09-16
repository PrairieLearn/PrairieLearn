var ERR = require('async-stacktrace');
var _ = require('lodash');
var path = require('path');
var async = require('async');
var moment = require('moment-timezone');

var logger = require('../../logger');
var config = require('../../config');
var sqldb = require('../../sqldb');
var sqlLoader = require('../../sql-loader');

var sql = sqlLoader.load(path.join(__dirname, 'courseInstances.sql'));

module.exports = {
    sync: function(courseInfo, courseInstanceDB, callback) {
        var that = module.exports;
        var courseInstanceIds = [];
        async.series([
            function(callback) {
                async.forEachOfSeries(courseInstanceDB, function(courseInstance, courseInstanceShortName, callback) {
                    logger.info('Syncing ' + courseInstance.longName);
                    var params = {
                        course_id: courseInfo.courseId,
                        short_name: courseInstanceShortName,
                        long_name: courseInstance.longName,
                        number: courseInstance.number,
                    };
                    sqldb.query(sql.insert_course_instance, params, function(err, result) {
                        if (ERR(err, callback)) return;
                        var courseInstanceId = result.rows[0].id;
                        courseInstanceIds.push(courseInstanceId);
                        courseInstance.courseInstanceId = courseInstanceId;
                        that.syncAccessRules(courseInstance, callback);
                    });
                }, function(err) {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
            function(callback) {
                // soft-delete courseInstances from the DB that aren't on disk
                logger.info('Soft-deleting unused course_instances');
                var params = {
                    course_id: courseInfo.courseId,
                    keep_course_instance_ids: courseInstanceIds,
                };
                sqldb.query(sql.soft_delete_unused_course_instances, params, function(err) {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
            function(callback) {
                // delete access rules from DB that don't correspond to assessments
                logger.info('Deleting unused course_instance_access_rules');
                sqldb.query(sql.delete_unused_course_instance_access_rules, [], function(err) {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
        ], function(err) {
            if (ERR(err, callback)) return;
            callback(null);
        });
    },

    syncAccessRules: function(courseInstance, callback) {
        var allowAccess = courseInstance.allowAccess || [];
        async.forEachOfSeries(allowAccess, function(dbRule, i, callback) {
            logger.info('Syncing course instance access rule number ' + (i + 1));
            var params = {
                course_instance_id: courseInstance.courseInstanceId,
                number: i + 1,
                role: _(dbRule).has('role') ? dbRule.role : null,
                uids: _(dbRule).has('uids') ? dbRule.uids : null,
                start_date: _(dbRule).has('startDate') ? moment.tz(dbRule.startDate, config.timezone).format() : null,
                end_date: _(dbRule).has('endDate') ? moment.tz(dbRule.endDate, config.timezone).format() : null,
            };
            sqldb.query(sql.insert_course_instance_access_rule, params, function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        }, function(err) {
            if (ERR(err, callback)) return;

            // delete access rules from the DB that aren't on disk
            logger.info('Deleting excess course instance access rules for current assessment');
            var params = {
                course_instance_id: courseInstance.courseInstanceId,
                last_number: allowAccess.length,
            };
            sqldb.query(sql.delete_excess_course_instance_access_rules, params, function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        });
    },
};
