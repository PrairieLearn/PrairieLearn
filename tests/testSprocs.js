var ERR = require('async-stacktrace');
var _ = require('lodash');
var assert = require('chai').assert;
var async = require('async');

var config = require('../lib/config');
var sqldb = require('@prairielearn/prairielib').sqldb;
var sqlLoader = require('@prairielearn/prairielib').sqlLoader;
var sql = sqlLoader.loadSqlEquiv(__filename);
var helperDb = require('./helperDb');


var caa_reservation_tests = function(assessment_id, exam_id, expectWideOpen=false) {

    var expectedWord = 'fail';
    var expectedBool = false;

    // Handle the special case without any linking
    if (expectWideOpen) {
        expectedWord = 'pass';
        expectedBool = true;
    }

    it('pass for instructor inside start_date/end_date', function(callback) {
        var params = [
            assessment_id,
            'Exam',
            'Instructor',
            1002,
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

    it(expectedWord + ' for student inside start_date/end_date, no reservation', function(callback) {
        var params = [
            assessment_id,
            'Exam',
            'Student',
            1002,
            'instructor@school.edu',
            '2010-07-07 06:06:06-00',
            'US/Central',
        ];

        sqldb.call(`check_assessment_access`, params, (err, result) => {
            if (ERR(err, result)) return;
            assert.strictEqual(result.rows[0].authorized, expectedBool);
            callback();
        });
    });

    it('create reservation for student', function(callback) {
        sqldb.query(sql.insert_ps_reservation, {exam_id}, (err, result) => {
            if (ERR(err,callback)) return;
            callback();
        });
    });


    it('pass for student inside start_date/end_date, checked in reservation, inside access_start/end', function(callback) {
        var params = [
            assessment_id,
            'Exam',
            'Student',
            1000,
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

    it(expectedWord + ' for student inside start_date/end_date, checked in reservation, after access_start/end', function(callback) {
        var params = [
            assessment_id,
            'Exam',
            'Student',
            1000,
            'student@school.edu',
            '2010-08-07 06:06:06-00',
            'US/Central',
        ];

        sqldb.call(`check_assessment_access`, params, (err, result) => {
            if (ERR(err, result)) return;
            assert.strictEqual(result.rows[0].authorized, expectedBool);
            callback();
        });
    });
};




describe('SPROC Stored Procedure Function Unit Testing', function() {

    before('set up testing server', helperDb.before);
    after('tear down testing database', helperDb.after);

    describe('check_assessment_access', function() {

        before('setup sample environment', function(callback) {
            sqldb.query(sql.setup_caa_tests, {}, (err, result) => {
                if (ERR(err, callback)) return;
                callback();
            });
        });


        describe('PL course not linked anywhere', () => {
            describe('unlinked exam', () => {
                caa_reservation_tests(10, 1, true);
            });
            describe('linked exam', () => {
                caa_reservation_tests(11, 1);
            });
            describe('linked exam in different PS course', () => {
                caa_reservation_tests(12, 5);
            });
        });

        describe('PL course linked to 1 PS course', () => {
            describe('unlinked exam', () => {
                caa_reservation_tests(20, 2);
            });
            describe('linked exam', () => {
                caa_reservation_tests(21, 2);
            });
            describe('linked exam in different PS course', () => {
                caa_reservation_tests(22, 5);
            });
        });

        describe('PL course linked to >1 PS course', () => {
            describe('unlinked exam', () => {
                caa_reservation_tests(40, 4);
            });
            describe('linked exam', () => {
                caa_reservation_tests(41, 4);
            });
            describe('linked exam in different PS course', () => {
                caa_reservation_tests(42, 5);
            });
        });

/*

        describe('link PL course to 1 PS course', () => {

            before('update database to link PL/PS courses', function(callback) {
                sqldb.query(sql.insert_ps_course_link, {course_id: 24, pl_course_id: 2}, (err, result) => {
                    if (ERR(err, callback)) return;
                    callback();
                });
            });

            caa_reservation_tests(201, 3);
        });
        describe('link PL course to >1 PS course', () => {
            caa_reservation_tests(200, 1);
        });

        describe('link PL assessment to PS exam, PL course not linked anywhere', function() {
            caa_reservation_tests(203, 4);
        });

        describe('link PL assessment to PS exam, PL course not linked to this PS course but to others', function() {
            caa_reservation_tests(202, 2);
        });

        describe('link PL assessment to PS exam, PL course linked to this PS course', function() {
            caa_reservation_tests(202, 2);
        });
*/
    });
});


var foo = `

PL course not linked anywhere
PL course linked to 1 PS course
PL course linked to 2 PS courses


previous semesters linked
proficiency PS and course PS

exam link with no PL link
exam link with PL link for this PS course
exam link with PL link for other PS courses but not this one



`;
