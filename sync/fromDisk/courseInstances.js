var ERR = require('async-stacktrace');
var _ = require('lodash');
var async = require('async');

var logger = require('../../lib/logger');
var sqldb = require('@prairielearn/prairielib/sql-db');
var sqlLoader = require('@prairielearn/prairielib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

function safeAsync(func, callback) {
    new Promise(async () => {
        let error = null;
        let result;
        try {
            result = await func();
        } catch (err) {
            error = err;
        }
        callback(error, result);
    });
};

module.exports.sync = function(courseInfo, courseInstanceDB, callback) {
    safeAsync(async () => {

    }, callback);
}

module.exports.sync = function(courseInfo, courseInstanceDB, callback) {
    var that = module.exports;
    var courseInstanceIds = [];
    async.series([
        function(callback) {
            var err = null;
            _(courseInstanceDB)
                .groupBy('uuid')
                .each(function(courseInstances, uuid) {
                    if (courseInstances.length > 1) {
                        err = new Error('UUID ' + uuid + ' is used in multiple courseInstances: '
                                        + _.map(courseInstances, 'directory').join());
                        return false; // terminate each()
                    }
                });
            if (err) return callback(err);
            callback(null);
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
                    display_timezone: courseInstance.timezone || courseInfo.timezone || 'America/Chicago',
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
            sqldb.query(sql.soft_delete_unused_course_instances, params, function(err, _result) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
        function(callback) {
            // delete access rules from DB that don't correspond to assessments
            logger.debug('Deleting unused course_instance_access_rules');
            sqldb.query(sql.delete_unused_course_instance_access_rules, [], function(err, _result) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
    ], function(err) {
        if (ERR(err, callback)) return;
        callback(null);
    });
}

module.exports.syncAccessRules = function(courseInstance, callback) {
    var allowAccess = courseInstance.allowAccess || [];
    async.forEachOfSeries(allowAccess, function(dbRule, i, callback) {
        logger.debug('Syncing course instance access rule number ' + (i + 1));
        var params = {
            course_instance_id: courseInstance.courseInstanceId,
            number: i + 1,
            role: _(dbRule).has('role') ? dbRule.role : null,
            uids: _(dbRule).has('uids') ? dbRule.uids : null,
            start_date: _(dbRule).has('startDate') ? dbRule.startDate : null,
            end_date: _(dbRule).has('endDate') ? dbRule.endDate : null,
            institution: _(dbRule).has('institution') ? dbRule.institution : 'UIUC',
        };
        sqldb.query(sql.insert_course_instance_access_rule, params, function(err, _result) {
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
        sqldb.query(sql.delete_excess_course_instance_access_rules, params, function(err, _result) {
            if (ERR(err, callback)) return;
            callback(null);
        });
    });
}
