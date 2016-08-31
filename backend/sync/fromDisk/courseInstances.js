var ERR = require('async-stacktrace');
var _ = require('underscore');
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
        var ids = [];
        async.series([
            function(callback) {
                async.forEachOfSeries(courseInstanceDB, function(courseInstance, courseInstanceShortName, callback) {
                    var params = [courseInfo.courseId, courseInstanceShortName, courseInstance.longName,
                                  courseInstance.number, courseInstance.startDate, courseInstance.endDate];
                    sqldb.query(sql.all, params, function(err, result) {
                        if (ERR(err, callback)) return;
                        var courseInstanceId = result.rows[0].id;
                        ids.push(courseInstanceId);
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
                var paramIndexes = ids.map(function(item, idx) {return "$" + (idx + 2);});
                var sql = 'WITH'
                    + ' course_instance_ids AS ('
                    + '     SELECT id'
                    + '     FROM course_instances'
                    + '     WHERE course_id = $1'
                    + '     AND deleted_at IS NULL'
                    + ' )'
                    + ' UPDATE course_instances SET deleted_at = CURRENT_TIMESTAMP'
                    + ' WHERE id IN (SELECT * FROM course_instance_ids)'
                    + ' AND ' + (ids.length === 0 ? 'TRUE' : 'id NOT IN (' + paramIndexes.join(',') + ')')
                    + ' ;';
                var params = [courseInfo.courseId].concat(ids);
                sqldb.query(sql, params, function(err) {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
            function(callback) {
                // delete access rules from DB that don't correspond to assessments
                logger.info('Deleting unused course instance access rules');
                var sql
                    = 'DELETE FROM course_instance_access_rules AS ciar'
                    + ' WHERE NOT EXISTS ('
                    + '     SELECT * FROM course_instances AS ci'
                    + '     WHERE ci.id = ciar.course_instance_id'
                    + '     AND ci.deleted_at IS NULL'
                    + ' );';
                sqldb.query(sql, [], function(err) {
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
            var sql
                = ' INSERT INTO course_instance_access_rules (course_instance_id, number, role, uids, start_date, end_date)'
                + ' VALUES ($1::integer, $2::integer, $3::enum_role, $4,'
                + '     $5::timestamp with time zone, $6::timestamp with time zone)'
                + ' ON CONFLICT (number, course_instance_id) DO UPDATE'
                + ' SET'
                + '     role = EXCLUDED.role,'
                + '     uids = EXCLUDED.uids,'
                + '     start_date = EXCLUDED.start_date,'
                + '     end_date = EXCLUDED.end_date'
                + ' ;';
            var params = [
                courseInstance.courseInstanceId,
                i + 1,
                _(dbRule).has('role') ? dbRule.role : null,
                _(dbRule).has('uids') ? '{' + dbRule.uids.join(',') + '}' : null,  // FIXME: SQL injection
                _(dbRule).has('startDate') ? moment.tz(dbRule.startDate, config.timezone).format() : null,
                _(dbRule).has('endDate') ? moment.tz(dbRule.endDate, config.timezone).format() : null,
            ];
            logger.info('Syncing course instance access rule number ' + (i + 1));
            sqldb.query(sql, params, function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        }, function(err) {
            if (ERR(err, callback)) return;

            // delete access rules from the DB that aren't on disk
            logger.info('Deleting unused course instance access rules for current assessment');
            var sql = 'DELETE FROM course_instance_access_rules WHERE course_instance_id = $1 AND number > $2;';
            var params = [courseInstance.courseInstanceId, allowAccess.length];
            sqldb.query(sql, params, function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        });
    },
};
