var ERR = require('async-stacktrace');
var _ = require('lodash');
var assert = require('assert');

var courseDB = require('../lib/course-db');
var sqldb = require('../lib/sqldb');
var testHelperDb = require('./testHelperDb');
var syncCourseInfo = require('../sync/fromDisk/courseInfo');
var sqlLoader = require('../lib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

var courseDir = '../exampleCourse';

describe('sync/fromDisk/courseInfo', function() {

    var course;
    before("load course from disk", function(callback) {
        courseDB.loadFullCourse(courseDir, function(err, c) {
            if (ERR(err, callback)) return;
            course = c;
            callback(null);
        });
    });

    before("set up testing DB", testHelperDb.before);
    after("shut down testing DB", testHelperDb.after);
    
    describe('syncCourseInfo()', function() {
        it('should succeed', function(callback) {
            syncCourseInfo.sync(course.courseInfo, function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        });
    });

    describe('the database "course" table', function() {
        it('should contain TPL 101', function(callback) {
            sqldb.queryOneRow(sql.select_course, [], function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        });
    });
});
