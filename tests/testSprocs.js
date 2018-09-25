var ERR = require('async-stacktrace');
var _ = require('lodash');
var assert = require('chai').assert;
var async = require('async');

var config = require('../lib/config');
var sqldb = require('@prairielearn/prairielib').sqldb;
var sqlLoader = require('@prairielearn/prairielib').sqlLoader;
var sql = sqlLoader.loadSqlEquiv(__filename);
var helperDb = require('./helperDb');


var caa_reservation_tests = function(assessment_id, exam_id, second_assessment_id, expectWideOpen=false, seeOtherExams=false) {

    var expectedWord = 'fail';
    var expectedBool = false;

    // Handle the special case without any linking
    if (expectWideOpen) {
        expectedWord = 'pass';
        expectedBool = true;
    }

    it(`${expectedWord} for student inside start_date/end_date, no reservation, assessment ${assessment_id}`, function(callback) {
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

    describe(`with checked-in reservation for student for exam ${exam_id}`, () => {

        before(`create checked-in reservation for student for exam ${exam_id}`, function(callback) {
            sqldb.query(sql.insert_ps_reservation, {exam_id}, (err, result) => {
                if (ERR(err,callback)) return;
                callback();
            });
        });


        it('pass for student inside start_date/end_date, checked-in reservation, inside access_start/end', function(callback) {
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

        it(expectedWord + ' for student inside start_date/end_date, checked-in reservation, after access_start/end', function(callback) {
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

        var otherExams = {
            word: 'fail',
            bool: false,
        };
        if (seeOtherExams) {
            otherExams.word = 'pass';
            otherExams.bool = true;
        }

        it(`${otherExams.word} for access to PL course other assessment (${second_assessment_id}) when checked-in to exam ${exam_id}`, function(callback) {
            var params = [
                second_assessment_id,
                'Exam',
                'Student',
                1000,
                'student@school.edu',
                '2010-07-07 06:06:06-00',
                'US/Central',
            ];

            sqldb.call(`check_assessment_access`, params, (err, result) => {
                if (ERR(err, result)) return;
                assert.strictEqual(result.rows[0].authorized, otherExams.bool);
                callback();
            });
        });
    });
};

describe('Stored Procedure Function Unit Testing', function() {

    before('set up testing server', helperDb.before);
    after('tear down testing database', helperDb.after);

    describe('check_assessment_access', function() {

        before('setup sample environment', function(callback) {
            sqldb.query(sql.setup_caa_tests, {}, (err, result) => {
                if (ERR(err, callback)) return;
                callback();
            });
        });

        /***
        is instructor
        mismatched mode, role,
        uid null or in list
        start_date, end_date
        ***/

        describe('PL course not linked anywhere', () => {
            describe('Unlinked exam', () => {
                caa_reservation_tests(10, 1, 13, true, true);
            });
            describe('Linked exam', () => {
                caa_reservation_tests(11, 1, 13, false, true);
            });
            describe('Linked exam in different PS course', () => {
                caa_reservation_tests(12, 5, 13, false, true);
            });
        });

        describe('PL course linked to 1 PS course', () => {
            describe('Unlinked exam', () => {
                caa_reservation_tests(20, 2, 23, false, true);
            });
            describe('Linked exam', () => {
                caa_reservation_tests(21, 2, 23, false, false);
            });
            describe('Linked exam in different PS course', () => {
                caa_reservation_tests(22, 5, 23, false, false);
            });
        });

        describe('PL course linked to >1 PS course', () => {
            describe('Unlinked exam', () => {
                caa_reservation_tests(40, 4, 43, false, true);
            });
            describe('Linked exam', () => {
                caa_reservation_tests(41, 4, 43, false, false);
            });
            describe('Linked exam in different PS course', () => {
                caa_reservation_tests(42, 5, 43, false, false);
            });
        });
    });
});
