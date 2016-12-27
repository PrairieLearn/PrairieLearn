var ERR = require('async-stacktrace');
var _ = require('lodash');
var path = require('path');
var async = require('async');
var moment = require('moment-timezone');

var logger = require('../../lib/logger');
var config = require('../../lib/config');
var sqldb = require('../../lib/sqldb');
var sqlLoader = require('../../lib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

module.exports = {
    sync: function(courseInfo, courseInstanceDB, callback) {
        var that = module.exports;
        var courseInstanceIds = [];
        async.series([
            // TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP
            //   TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP
            // TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP
            //   TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP
            function(callback) {
                logger.verbose('FIXME tmp uuid course_instances add');
                async.forEachOfSeries(courseInstanceDB, function(courseInstance, courseInstanceShortName, callback) {
                    logger.debug('FIXME tmp uuid add ' + courseInstance.longName);
                    sqldb.call('set_course_instance_uuid', [courseInfo.courseId, courseInstanceShortName, courseInstance.uuid], function(err, result) {
                        if (ERR(err, callback)) return;
                        callback(null);
                    });
                }, function(err) {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
            // TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP
            //   TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP
            // TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP
            //   TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP TMP
            function(callback) {
                async.forEachOfSeries(courseInstanceDB, function(courseInstance, courseInstanceShortName, callback) {
                    logger.debug('Checking uuid for ' + courseInstanceShortName);
                    sqldb.call('course_instances_with_uuid_elsewhere', [courseInfo.courseId, courseInstance.uuid], function(err, result) {
                        if (ERR(err, callback)) return;
                        if (result.rowCount > 0) return callback(new Error('UUID ' + courseInstance.uuid + ' from course instance ' + courseInstanceShortName + ' already in use in different course'));
                        callback(null);
                    });
                }, function(err) {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
            function(callback) {
                async.forEachOfSeries(courseInstanceDB, function(courseInstance, courseInstanceShortName, callback) {
                    logger.debug('Syncing ' + courseInstance.longName);
                    var params = {
                        course_id: courseInfo.courseId,
                        uuid: courseInstance.uuid,
                        short_name: courseInstanceShortName,
                        long_name: courseInstance.longName,
                        number: courseInstance.number,
                    };
                    sqldb.query(sql.insert_course_instance, params, function(err, result) {
                        if (ERR(err, callback)) return;
                        var courseInstanceId = result.rows[0].id;
                        courseInstanceIds.push(courseInstanceId);
                        courseInstance.courseInstanceId = courseInstanceId;
                        that.syncAccessRules(courseInstance, function(err) {
                            if (ERR(err, callback)) return;
                            callback(null);
                        });
                    });
                }, function(err) {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
            function(callback) {
                // soft-delete courseInstances from the DB that aren't on disk
                logger.debug('Soft-deleting unused course_instances');
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
                logger.debug('Deleting unused course_instance_access_rules');
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
            logger.debug('Syncing course instance access rule number ' + (i + 1));
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
            logger.debug('Deleting excess course instance access rules for current assessment');
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
