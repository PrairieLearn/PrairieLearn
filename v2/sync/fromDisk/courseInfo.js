var ERR = require('async-stacktrace');
var _ = require('lodash');
var path = require('path');

var config = require('../../config');
var sqldb = require('../../sqldb');
var sqlLoader = require('../../sql-loader');

var sql = sqlLoader.load(path.join(__dirname, 'courseInfo.sql'));

module.exports = {
    sync: function(courseInfo, callback) {
        var params = {
            short_name: courseInfo.name,
            title: courseInfo.title,
            path: courseInfo.path,
        };
        sqldb.query(sql.insert_course, params, function(err, result) {
            if (ERR(err, callback)) return;
            courseInfo.courseId = result.rows[0].course_id;
            callback(null);
        });
    },
};
