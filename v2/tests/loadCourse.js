var ERR = require('async-stacktrace');
var _ = require('lodash');
var assert = require('assert');

var courseDB = require('../lib/course-db');

var courseDir = '../exampleCourse';

describe('courseDB.loadFullCourse()', function() {

    var course;
    before("load course from disk", function(callback) {
        courseDB.loadFullCourse(courseDir, function(err, c) {
            if (ERR(err, callback)) return;
            course = c;
            callback(null);
        });
    });

    describe('the in-memory "course" object', function() {
        it('should contain "courseInfo"', function() {
            assert.ok(course.courseInfo);
        });
        it('should contain "questionDB"', function() {
            assert.ok(course.questionDB);
        });
        it('should contain "courseInstanceDB"', function() {
            assert.ok(course.courseInstanceDB);
        });
    });
});
