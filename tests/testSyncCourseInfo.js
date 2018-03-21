var ERR = require('async-stacktrace');

var courseDB = require('../lib/course-db');
var sqldb = require('@prairielearn/prairielib/sql-db');
var helperDb = require('./helperDb');
var syncCourseInfo = require('../sync/fromDisk/courseInfo');
var sqlLoader = require('@prairielearn/prairielib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

var logger = require('./dummyLogger');
var courseDir = 'exampleCourse';
var course_id = 1;

describe('sync/fromDisk/courseInfo', function() {
    this.timeout(20000);

    var course;
    before('load course from disk', function(callback) {
        courseDB.loadFullCourse(courseDir, logger, function(err, c) {
            if (ERR(err, callback)) return;
            course = c;
            callback(null);
        });
    });

    before('set up testing DB', helperDb.before);
    after('shut down testing DB', helperDb.after);

    describe('sprocs/select_or_insert_course_by_path', function() {
        it('should use id 1 for exampleCourse', function(callback) {
            sqldb.callOneRow('select_or_insert_course_by_path', [courseDir], function(err, result) {
                if (ERR(err, callback)) return;
                if (course_id != result.rows[0].course_id) {
                    return callback(new Error('unexpected course_id: ' + result.rows[0].course_id));
                }
                callback(null);
            });
        });
    });

    describe('syncCourseInfo()', function() {
        it('should succeed', function(callback) {
            syncCourseInfo.sync(course.courseInfo, course_id, function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        });
    });

    describe('the "pl_courses" table', function() {
        it('should contain XC 101', function(callback) {
            sqldb.queryOneRow(sql.select_course, [], function(err, _result) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        });
    });
});
