const ERR = require('async-stacktrace');
const _ = require('lodash');

const error = require('@prairielearn/prairielib/error');
const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');

const sql = sqlLoader.loadSqlEquiv(__filename);

module.exports.sync = (courseInfo, course_id, callback) => {
    const params = {
        course_id: course_id,
        short_name: courseInfo.name,
        title: courseInfo.title,
        display_timezone: courseInfo.timezone || null,
        grading_queue: courseInfo.name.toLowerCase().replace(' ', ''),
        options: courseInfo.options,
    };
    sqldb.queryZeroOrOneRow(sql.update_course, params, (err, result) => {
        if (ERR(err, callback)) return;
        if (result.rowCount !== 1) return callback(error.makeWithData('Unable to find course', {course_id, courseInfo}));
        courseInfo.courseId = course_id;
        courseInfo.timezone = result.rows[0].display_timezone;
        callback(null);
    });
}
