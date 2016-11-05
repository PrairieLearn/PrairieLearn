var ERR = require('async-stacktrace');
var _ = require('lodash');
var path = require('path');

var config = require('../../lib/config');
var sqldb = require('../../lib/sqldb');
var sqlLoader = require('../../lib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

module.exports = {
    sync: function(courseInfo, callback) {
        var params = {
            short_name: courseInfo.name,
            title: courseInfo.title,
            path: courseInfo.path,
            grading_queue: courseInfo.name.toLowerCase().replace(' ', ''),
        };
        sqldb.query(sql.insert_course, params, function(err, result) {
            if (ERR(err, callback)) return;
            courseInfo.courseId = result.rows[0].course_id;
            callback(null);
        });
    },
};
