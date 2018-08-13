var ERR = require('async-stacktrace');
var _ = require('lodash');
var path = require('path');

var error = require('@prairielearn/prairielib/error');
var config = require('../../lib/config');
var sqldb = require('@prairielearn/prairielib/sql-db');
var sqlLoader = require('@prairielearn/prairielib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

module.exports = {
    sync: function(courseInfo, course_id, callback) {
        var params = {
            course_id: course_id,
            short_name: courseInfo.name,
            title: courseInfo.title,
            display_timezone: courseInfo.timezone || null,
            grading_queue: courseInfo.name.toLowerCase().replace(' ', ''),
        };
        sqldb.queryZeroOrOneRow(sql.update_course, params, function(err, result) {
            if (ERR(err, callback)) return;
            if (result.rowCount != 1) return callback(error.makeWithData('Unable to find course', {course_id, courseInfo}));
            courseInfo.courseId = course_id;
            courseInfo.timezone = result.rows[0].display_timezone;
            callback(null);
        });
    },
};
