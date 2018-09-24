var ERR = require('async-stacktrace');
var _ = require('lodash');
var assert = require('chai').assert;
var async = require('async');

var config = require('../lib/config');
var sqldb = require('@prairielearn/prairielib').sqldb;
var sqlLoader = require('@prairielearn/prairielib').sqlLoader;
var sql = sqlLoader.loadSqlEquiv(__filename);
var helperDb = require('./helperDb');


describe('SPROC Stored Procedure Function Unit Testing', function() {

    before('set up testing server', helperDb.before);
    after('tear down testing database', helperDb.after);

    describe('check_assessment_access', function() {

        before('setup sample environment', function(callback) {
            sqldb.query(sql.setup_pspl_link, {}, (err, result) => {
                if (ERR(err, callback)) return;
                callback();
            });
        });

        it('pass for instructor inside start_date/end_date', function(callback) {
            var params = [
                201,
                'Exam',
                'Instructor',
                102,
                'instructor@school.edu',
                '2010-06-06 06:06:06-00',
                'US/Central',
            ];

            sqldb.call(`check_assessment_access`, params, (err, result) => {
                if (ERR(err, result)) return;
                assert.strictEqual(result.rows[0].authorized, true);
                callback();
            });
        });

        it('pass for instructor outside start_date/end_date', function(callback) {
            var params = [
                201,
                'Exam',
                'Instructor',
                102,
                'instructor@school.edu',
                '2020-06-06 06:06:06-00',
                'US/Central',
            ];

            sqldb.call(`check_assessment_access`, params, (err, result) => {
                if (ERR(err, result)) return;
                assert.strictEqual(result.rows[0].authorized, true);
                callback();
            });
        });

        it('pass for student inside start_date/end_date, no PL/PS linkage', function(callback) {
            var params = [
                201,
                'Exam',
                'Student',
                102,
                'instructor@school.edu',
                '2010-06-06 06:06:06-00',
                'US/Central',
            ];

            sqldb.call(`check_assessment_access`, params, (err, result) => {
                if (ERR(err, result)) return;
                assert.strictEqual(result.rows[0].authorized, true);
                callback();
            });
        });

        it('fail for student outside start_date/end_date, no PL/PS linkage', function(callback) {
            var params = [
                201,
                'Exam',
                'Student',
                102,
                'instructor@school.edu',
                '2020-06-06 06:06:06-00',
                'US/Central',
            ];

            sqldb.call(`check_assessment_access`, params, (err, result) => {
                if (ERR(err, result)) return;
                assert.strictEqual(result.rows[0].authorized, false);
                callback();
            });
        });

        describe('link PL course to 1 PS course', () => {

            before('update database to link PL/PS courses', function(callback) {
                sqldb.query(sql.insert_ps_course_link, {course_id: 24, pl_course_id: 2}, (err, result) => {
                    if (ERR(err, callback)) return;
                    callback();
                });
            });

            it('pass for instructor inside start_date/end_date', function(callback) {
                var params = [
                    201,
                    'Exam',
                    'Instructor',
                    102,
                    'instructor@school.edu',
                    '2010-06-06 06:06:06-00',
                    'US/Central',
                ];

                sqldb.call(`check_assessment_access`, params, (err, result) => {
                    if (ERR(err, result)) return;
                    assert.strictEqual(result.rows[0].authorized, true);
                    callback();
                });
            });

            it('fail for student inside start_date/end_date, no reservation', function(callback) {
                var params = [
                    201,
                    'Exam',
                    'Student',
                    102,
                    'instructor@school.edu',
                    '2010-07-07 06:06:06-00',
                    'US/Central',
                ];

                sqldb.call(`check_assessment_access`, params, (err, result) => {
                    if (ERR(err, result)) return;
                    assert.strictEqual(result.rows[0].authorized, false);
                    callback();
                });
            });

            it('create reservation for student', function(callback) {
                sqldb.query(sql.insert_ps_reservation, {exam_id: 3}, (err, result) => {
                    if (ERR(err,callback)) return;
                    callback();
                });
            });

            it('pass for student inside start_date/end_date, checked in reservation, inside access_start/end', function(callback) {
                var params = [
                    201,
                    'Exam',
                    'Student',
                    100,
                    'student@school.edu',
                    '2010-07-07 06:06:06-00',
                    'US/Central',
                ];

                sqldb.call(`check_assessment_access`, params, (err, result) => {
                    if (ERR(err, result)) return;
                    assert.strictEqual(result.rows[0].authorized, true);
                    callback();
                });
            });

            it('fail for student inside start_date/end_date, checked in reservation, after access_start/end', function(callback) {
                var params = [
                    201,
                    'Exam',
                    'Student',
                    100,
                    'student@school.edu',
                    '2010-08-07 06:06:06-00',
                    'US/Central',
                ];

                sqldb.call(`check_assessment_access`, params, (err, result) => {
                    if (ERR(err, result)) return;
                    assert.strictEqual(result.rows[0].authorized, false);
                    callback();
                });
            });
        });
        describe('link PL course to >1 PS course', () => {

            it('pass for instructor inside start_date/end_date', function(callback) {
                var params = [
                    200,
                    'Exam',
                    'Instructor',
                    102,
                    'instructor@school.edu',
                    '2010-06-06 06:06:06-00',
                    'US/Central',
                ];

                sqldb.call(`check_assessment_access`, params, (err, result) => {
                    if (ERR(err, result)) return;
                    assert.strictEqual(result.rows[0].authorized, true);
                    callback();
                });
            });

            it('fail for student inside start_date/end_date, no reservation', function(callback) {
                var params = [
                    200,
                    'Exam',
                    'Student',
                    102,
                    'instructor@school.edu',
                    '2010-07-07 06:06:06-00',
                    'US/Central',
                ];

                sqldb.call(`check_assessment_access`, params, (err, result) => {
                    if (ERR(err, result)) return;
                    assert.strictEqual(result.rows[0].authorized, false);
                    callback();
                });
            });

            it('create reservation for student', function(callback) {
                sqldb.query(sql.insert_ps_reservation, {exam_id: 1}, (err, result) => {
                    if (ERR(err,callback)) return;
                    callback();
                });
            });


            it('pass for student inside start_date/end_date, checked in reservation, inside access_start/end', function(callback) {
                var params = [
                    200,
                    'Exam',
                    'Student',
                    100,
                    'student@school.edu',
                    '2010-07-07 06:06:06-00',
                    'US/Central',
                ];

                sqldb.call(`check_assessment_access`, params, (err, result) => {
                    if (ERR(err, result)) return;
                    assert.strictEqual(result.rows[0].authorized, true);
                    callback();
                });
            });

            it('fail for student inside start_date/end_date, checked in reservation, after access_start/end', function(callback) {
                var params = [
                    200,
                    'Exam',
                    'Student',
                    100,
                    'student@school.edu',
                    '2010-08-07 06:06:06-00',
                    'US/Central',
                ];

                sqldb.call(`check_assessment_access`, params, (err, result) => {
                    if (ERR(err, result)) return;
                    assert.strictEqual(result.rows[0].authorized, false);
                    callback();
                });
            });
        });

        describe('link PL assessment to PS exam, linked PL course', function() {
            it('needs work');
        });
        describe('link PL assessment to PS exam, not linked PL course', function() {
            it('needs work');
        });

    });
});
