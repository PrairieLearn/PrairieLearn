var _ = require('underscore');

var config = require('../../config');
var sqldb = require('../../sqldb');

module.exports = {
    sync: function(courseInfo, callback) {
        var sql
            = ' INSERT INTO courses (short_name, title) VALUES ($1, $2)'
            + ' ON CONFLICT (short_name) DO UPDATE'
            + ' SET title = EXCLUDED.title'
            + ' RETURNING id AS course_id'
            + ' ;';
        var params = [courseInfo.name, courseInfo.title];
        sqldb.query(sql, params, function(err, result) {
            if (err) return callback(err);
            var courseId = result.rows[0].course_id;
            /*
              FIXME: For now we create a course instance for every semester, even if
              this course wasn't actually in all semesters.
            */
            var sql
                = ' WITH new_course_instances AS ('
                + '     SELECT c.course_id, s.id AS semester_id'
                + '     FROM (VALUES ($1::integer)) AS c (course_id)'
                + '     CROSS JOIN semesters AS s'
                + ' )'
                + ' INSERT INTO course_instances (course_id, semester_id)'
                + ' SELECT course_id, semester_id FROM new_course_instances'
                + ' ON CONFLICT DO NOTHING'
                + ' ;';
            var params = [courseId];
            sqldb.query(sql, params, function(err, result) {
                if (err) return callback(err);
                var sql = 'SELECT * FROM semesters WHERE short_name = $1;';
                var params = [config.defaultSemester];
                sqldb.query(sql, params, function(err, result) {
                    if (err) return callback(err);
                    var semesterId = result.rows[0].id;
                    var sql = 'SELECT * FROM course_instances WHERE course_id = $1 AND semester_id = $2;';
                    var params = [courseId, semesterId];
                    sqldb.query(sql, params, function(err, result) {
                        if (err) return callback(err);
                        var courseInstanceId = result.rows[0].id;
                        courseInfo.courseId = courseId;
                        courseInfo.semesterId = semesterId;
                        courseInfo.courseInstanceId = courseInstanceId;
                        callback(null);
                    });
                });
            });
        });
    },
};
