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

        it('setup sample environment', function(callback) {
            sqldb.query(sql.setup_pspl_link, {}, (err, result) => {
                if (ERR(err, callback)) return;
                callback();
            });
        });

        it('pass for instructor inside start_date, end_date', function(callback) {
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

        it('pass for instructor outside start_date, end_date', function(callback) {
            var params = [
                200,
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

        it('pass for student inside start_date, end_date, no PL/PS linkage', function(callback) {
            var params = [
                200,
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

        it('fail for student outside start_date, end_date, no PL/PS linkage', function(callback) {
            var params = [
                200,
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


    });
});
