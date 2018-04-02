var ERR = require('async-stacktrace');
var _ = require('lodash');
var async = require('async');

var logger = require('../../lib/logger');
var sqldb = require('@prairielearn/prairielib/sql-db');
var config = require('../../lib/config');
var sqlLoader = require('@prairielearn/prairielib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

module.exports = {
    sync: function(courseInfo, callback) {
        async.forEachOfSeries(courseInfo.assessmentSets, function(assessmentSet, i, callback) {
            logger.debug('Syncing assessment_set ' + assessmentSet.name);
            var params = {
                abbreviation: assessmentSet.abbreviation,
                name: assessmentSet.name,
                heading: assessmentSet.heading,
                color: assessmentSet.color,
                number: i + 1,
                course_id: courseInfo.courseId,
            };
            sqldb.query(sql.insert_assessment_set, params, callback);
        }, function(err) {
            if (ERR(err, callback)) return;

            // delete assessmentSets from the DB that aren't on disk
            logger.debug('Deleting excess assessment_sets');
            var params = {
                course_id: courseInfo.courseId,
                last_number: courseInfo.assessmentSets.length,
            };
            sqldb.query(sql.delete_excess_assessment_sets, params, function(err, _result) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        });
    },
};
