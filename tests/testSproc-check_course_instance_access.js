const ERR = require('async-stacktrace');
const assert = require('chai').assert;

const { sqldb, sqlLoader } = require('@prairielearn/prairielib');
const sql = sqlLoader.loadSqlEquiv(__filename);
const helperDb = require('./helperDb');

describe('sproc check_course_instance_access* tests', function() {

    before('set up testing server', helperDb.before);
    after('tear down testing database', helperDb.after);

    before('setup sample environment', function(callback) {
        sqldb.query(sql.setup_cia_generic_tests, {}, (err, _result) => {
            if (ERR(err, callback)) return;
            callback(null);
        });
    });

    it('pass for role Instructor', function(callback) {
        var params = {
            role: 'Instructor',
            uid: 'person1@host.com',
            date: null,
            ci_id: 1,
        };

        sqldb.query(sql.cia_test, params, (err, result) => {
            if (ERR(err, result)) return;
            assert.strictEqual(result.rows[0].authorized, true);
            callback(null);
        });
    });

    it('pass if all parameters match', function(callback) {
        var params = {
            role: 'TA',
            uid: 'person1@host.com',
            date: '2010-07-07 06:06:06-00',
            ciar_id: 1,
            short_name: 'host',
        };

        sqldb.query(sql.ciar_test, params, (err, result) => {
            if (ERR(err, callback)) return;
            assert.strictEqual(result.rows[0].authorized, true);
            callback(null);
        });
    });

    it('fail if role is too low', function(callback) {
        var params = {
            role: null,
            uid: 'user@school.edu',
            date: '2010-07-07 06:06:06-00',
            ciar_id: 1,
            short_name: 'school',
        };

        sqldb.query(sql.ciar_test, params, (err, result) => {
            if (ERR(err, callback)) return;
            assert.strictEqual(result.rows[0].authorized, false);
            callback(null);
        });
    });

    it('fail if uid not in list', function(callback) {
        var params = {
            role: 'TA',
            uid: 'unknown@host.com',
            date: '2010-07-07 06:06:06-00',
            ciar_id: 1,
            short_name: 'host',
        };

        sqldb.query(sql.ciar_test, params, (err, result) => {
            if (ERR(err, callback)) return;
            assert.strictEqual(result.rows[0].authorized, false);
            callback(null);
        });
    });

    it('fail if date is before start_date', function(callback) {
        var params = {
            role: 'TA',
            uid: 'person1@host.com',
            date: '2007-07-07 06:06:06-00',
            ciar_id: 1,
            short_name: 'host',
        };

        sqldb.query(sql.ciar_test, params, (err, result) => {
            if (ERR(err, callback)) return;
            assert.strictEqual(result.rows[0].authorized, false);
            callback(null);
        });
    });

    it('fail if date is after end_date', function(callback) {
        var params = {
            role: 'TA',
            uid: 'person1@host.com',
            date: '2017-07-07 06:06:06-00',
            ciar_id: 1,
            short_name: 'host',
        };

        sqldb.query(sql.ciar_test, params, (err, result) => {
            if (ERR(err, callback)) return;
            assert.strictEqual(result.rows[0].authorized, false);
            callback(null);
        });
    });

    it('pass if institution matches', function(callback) {
        var params = {
            role: 'Student',
            uid: 'person1@school.edu',
            date: '2011-07-07 06:06:06-00',
            ciar_id: 2,
            short_name: 'school',
        };

        sqldb.query(sql.ciar_test, params, (err, result) => {
            if (ERR(err, callback)) return;
            assert.strictEqual(result.rows[0].authorized, true);
            callback(null);
        });
    });

    it('fail if institution specified and does not match', function(callback) {
        var params = {
            role: 'Student',
            uid: 'person1@anotherschool.edu',
            date: '2011-07-07 06:06:06-00',
            ciar_id: 2,
            short_name: 'anotherschool',
        };

        sqldb.query(sql.ciar_test, params, (err, result) => {
            if (ERR(err, callback)) return;
            assert.strictEqual(result.rows[0].authorized, false);
            callback(null);
        });
    });

    it('fail if institution specified in rule is not in db', function(callback) {
        var params = {
            role: 'Student',
            uid: 'person1@anotherschool.edu',
            date: '2011-07-07 06:06:06-00',
            ciar_id: 3,
            short_name: 'anotherschool',
        };

        sqldb.query(sql.ciar_test, params, (err, result) => {
            if (ERR(err, callback)) return;
            assert.strictEqual(result.rows[0].authorized, false);
            callback(null);
        });
    });

    it('pass if user matches course institution', function(callback) {
        var params = {
            role: 'Student',
            uid: 'person1@school.edu',
            date: '2013-07-07 06:06:06-00',
            ciar_id: 4,
            short_name: 'school',
        };

        sqldb.query(sql.ciar_test, params, (err, result) => {
            if (ERR(err, callback)) return;
            assert.strictEqual(result.rows[0].authorized, true);
            callback(null);
        });
    });

    it('fail if user does not match course institution', function(callback) {
        var params = {
            role: 'Student',
            uid: 'person1@school.edu',
            date: '2013-07-07 06:06:06-00',
            ciar_id: 4,
            short_name: 'anotherschool',
        };

        sqldb.query(sql.ciar_test, params, (err, result) => {
            if (ERR(err, callback)) return;
            assert.strictEqual(result.rows[0].authorized, false);
            callback(null);
        });
    });
});
