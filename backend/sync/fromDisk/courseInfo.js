var _ = require('underscore');
var path = require('path');

var config = require('../../config');
var sqldb = require('../../sqldb');
var sqlLoader = require('../../sql-loader');

var sql = sqlLoader.load(path.join(__dirname, 'courseInfo.sql'));

module.exports = {
    sync: function(courseInfo, callback) {
        var params = [courseInfo.name, courseInfo.title, courseInfo.path];
        sqldb.query(sql.all, params, function(err, result) {
            if (err) return callback(err);
            courseInfo.courseId = result.rows[0].course_id;
            callback(null);
        });
    },
};
