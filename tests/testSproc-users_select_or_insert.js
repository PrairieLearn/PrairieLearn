var ERR = require('async-stacktrace');
var assert = require('chai').assert;
var debug = require('debug')('prairielearn:testSproc-users_select_or_insert');
var _ = require('lodash');

var sqldb = require('@prairielearn/prairielib').sqldb;
//var sqlLoader = require('@prairielearn/prairielib').sqlLoader;
//var sql = sqlLoader.loadSqlEquiv(__filename);
var helperDb = require('./helperDb');

var get_user_params = function(user_id, callback) {

    var search = `select user_id, uid, name, uin, provider FROM users WHERE user_id = $1;`;
    sqldb.queryOneRow(search, [user_id], (err, result) => {
        if (ERR(err, callback)) return;

        var u = result.rows[0];
        debug(u);
        callback(null, [u.uid, u.name, u.uin, u.provider]);
    });
};
                // uid, name, uin, provider
var base_user = [ 'user@host.com', 'Joe User', null, 'provider1' ];

describe('sproc users_select_or_insert tests', function() {

        before('set up testing server', helperDb.before);
        after('tear down testing database', helperDb.after);

        it('create new user', function(callback) {
            var params = _.clone(base_user);

            sqldb.call('users_select_or_insert', params, (err, result) => {
                if (ERR(err, callback)) return;

                var user_id = result.rows[0].user_id;
                assert.equal(user_id, 1);

                get_user_params(user_id, function(err, fromdb) {
                    if (ERR(err, callback)) return;
                    assert.deepEqual(params, fromdb);
                    callback(null);
                });
            });
        });

        it('create new user again, confirm info is the same', (callback) => {
            var params = _.clone(base_user);

            sqldb.call('users_select_or_insert', params, (err, result) => {
                if (ERR(err, callback)) return;

                var user_id = result.rows[0].user_id;
                assert.equal(user_id, 1);

                get_user_params(user_id, function(err, fromdb) {
                    if (ERR(err, callback)) return;
                    assert.deepEqual(params, fromdb);
                    callback(null);
                });
            });
        });

        it('user 1 updates name', (callback) => {
            var params = _.clone(base_user);
            params[1] = 'J.R. User';
            sqldb.call('users_select_or_insert', params, (err, result) => {
                if (ERR(err, callback)) return;

                var user_id = result.rows[0].user_id;
                assert.equal(user_id, 1);
                get_user_params(user_id, function(err, fromdb) {
                    if (ERR(err, callback)) return;
                    assert.deepEqual(params, fromdb);
                    callback(null);
                });
            });
        });

        it('user 1 updates provider', (callback) => {
            var params = _.clone(base_user);
            params[3] = 'provider2';
            sqldb.call('users_select_or_insert', params, (err, result) => {
                if (ERR(err, callback)) return;

                var user_id = result.rows[0].user_id;
                assert.equal(user_id, 1);
                get_user_params(user_id, function(err, fromdb) {
                    if (ERR(err, callback)) return;
                    assert.deepEqual(params, fromdb);
                    callback(null);
                });
            });
        });

        it('user 1 updates uin when uin was null', (callback) => {
            var params = _.clone(base_user);
            params[2] = '111122223';
            sqldb.call('users_select_or_insert', params, (err, result) => {
                if (ERR(err, callback)) return;

                var user_id = result.rows[0].user_id;
                assert.equal(user_id, 1);
                get_user_params(user_id, function(err, fromdb) {
                    if (ERR(err, callback)) return;
                    assert.deepEqual(params, fromdb);
                    callback(null);
                });
            });
        });

        it('user 1 updates uin when uin was value', (callback) => {
            var params = _.clone(base_user);
            params[2] = '111122224';
            sqldb.call('users_select_or_insert', params, (err, result) => {
                if (ERR(err, callback)) return;

                var user_id = result.rows[0].user_id;
                assert.equal(user_id, 1);
                get_user_params(user_id, function(err, fromdb) {
                    if (ERR(err, callback)) return;
                    assert.deepEqual(params, fromdb);
                    callback(null);
                });
            });
        });

        it('user 1 updates uid with already present uin', (callback) => {
            var params = _.clone(base_user);
            params[2] = '111122224';
            params[0] = 'newuid@host.com';
            sqldb.call('users_select_or_insert', params, (err, result) => {
                if (ERR(err, callback)) return;

                var user_id = result.rows[0].user_id;
                assert.equal(user_id, 1);
                get_user_params(user_id, function(err, fromdb) {
                    if (ERR(err, callback)) return;
                    assert.deepEqual(params, fromdb);
                    callback(null);
                });
            });
        });

/*
        it('user 1 updates uid with already present uin', (callback) => {
            var params = _.clone(base_user);
            params[2] = '';
            params[0] = 'newuid@host.com';
            sqldb.call('users_select_or_insert', params, (err, result) => {
                if (ERR(err, callback)) return;

                var user_id = result.rows[0].user_id;
                assert.equal(user_id, 1);
                get_user_params(user_id, function(err, fromdb) {
                    if (ERR(err, callback)) return;
                    assert.deepEqual(params, fromdb);
                    callback(null);
                });
            });
        });
*/
        it('user 2 create under shibboleth', (callback) => {
            var params = ['joe@illinois.edu', 'Joe Bob', '444444444', 'shibboleth'];
            sqldb.call('users_select_or_insert', params, (err, result) => {
                if (ERR(err, callback)) return;

                var user_id = result.rows[0].user_id;
                assert.equal(user_id, 2);
                get_user_params(user_id, function(err, fromdb) {
                    if (ERR(err, callback)) return;
                    assert.deepEqual(params, fromdb);
                    callback(null);
                });
            });
        });

        it('user 2 logs in via google', (callback) => {
            var params = ['joe@illinois.edu', 'joe@illinois.edu', null, 'google'];
            var after = ['joe@illinois.edu', 'joe@illinois.edu', '444444444', 'google'];

            sqldb.call('users_select_or_insert', params, (err, result) => {
                if (ERR(err, callback)) return;

                var user_id = result.rows[0].user_id;
                assert.equal(user_id, 2);
                get_user_params(user_id, function(err, fromdb) {
                    if (ERR(err, callback)) return;
                    assert.deepEqual(after, fromdb);
                    callback(null);
                });
            });
        });


        it('user 3 create under google', (callback) => {
            var params = ['sally@illinois.edu', 'sally@illinois.edu', null, 'google'];
            sqldb.call('users_select_or_insert', params, (err, result) => {
                if (ERR(err, callback)) return;

                var user_id = result.rows[0].user_id;
                assert.equal(user_id, 3);
                get_user_params(user_id, function(err, fromdb) {
                    if (ERR(err, callback)) return;
                    assert.deepEqual(params, fromdb);
                    callback(null);
                });
            });
        });

        it('user 3 logs in via shibboleth', (callback) => {
            var params = ['sally@illinois.edu', 'Sally Ann', '555566665', 'shibboleth'];

            sqldb.call('users_select_or_insert', params, (err, result) => {
                if (ERR(err, callback)) return;

                var user_id = result.rows[0].user_id;
                assert.equal(user_id, 3);
                get_user_params(user_id, function(err, fromdb) {
                    if (ERR(err, callback)) return;
                    assert.deepEqual(params, fromdb);
                    callback(null);
                });
            });
        });

        it('user 3 logs back in via google', (callback) => {
            var params = ['sally@illinois.edu', 'sally@illinois.edu', null, 'google'];
            var after = ['sally@illinois.edu', 'sally@illinois.edu', '555566665', 'google'];

            sqldb.call('users_select_or_insert', params, (err, result) => {
                if (ERR(err, callback)) return;

                var user_id = result.rows[0].user_id;
                assert.equal(user_id, 3);
                get_user_params(user_id, function(err, fromdb) {
                    if (ERR(err, callback)) return;
                    assert.deepEqual(after, fromdb);
                    callback(null);
                });
            });
        });


});

/*
        it('pass if all parameters match', function(callback) {
            var params = {
                mode: 'Exam',
                role: 'TA',
                user_id: 1020,
                uid: 'person1@host.com',
                date: '2010-07-07 06:06:06-00',
                use_date_check: true,
                aar_id: 1,
            };

            sqldb.query(sql.caar_test, params, (err, result) => {
                if (ERR(err, callback)) return;
                assert.strictEqual(result.rows[0].authorized, true);
                callback(null);
            });
        });

        it('fail if mode does not match', function(callback) {
            var params = {
                mode: 'Public',
                role: 'TA',
                user_id: 1020,
                uid: 'person1@host.com',
                date: '2010-07-07 06:06:06-00',
                use_date_check: false,
                aar_id: 1,
            };

            sqldb.query(sql.caar_test, params, (err, result) => {
                if (ERR(err, callback)) return;
                assert.strictEqual(result.rows[0].authorized, false);
                callback(null);
            });
        });

        it('fail if role is too low', function(callback) {
            var params = {
                mode: 'Exam',
                role: null,
                user_id: 1020,
                uid: 'person1@host.com',
                date: '2010-07-07 06:06:06-00',
                use_date_check: false,
                aar_id: 1,
            };

            sqldb.query(sql.caar_test, params, (err, result) => {
                if (ERR(err, callback)) return;
                assert.strictEqual(result.rows[0].authorized, false);
                callback(null);
            });
        });

        it('fail if uid not in list', function(callback) {
            var params = {
                mode: 'Exam',
                role: 'TA',
                user_id: 1020,
                uid: 'unknown@host.com',
                date: '2010-07-07 06:06:06-00',
                use_date_check: false,
                aar_id: 1,
            };

            sqldb.query(sql.caar_test, params, (err, result) => {
                if (ERR(err, callback)) return;
                assert.strictEqual(result.rows[0].authorized, false);
                callback(null);
            });
        });

        it('fail if date is before start_date', function(callback) {
            var params = {
                mode: 'Exam',
                role: 'TA',
                user_id: 1020,
                uid: 'person1@host.com',
                date: '2007-07-07 06:06:06-00',
                use_date_check: true,
                aar_id: 1,
            };

            sqldb.query(sql.caar_test, params, (err, result) => {
                if (ERR(err, callback)) return;
                assert.strictEqual(result.rows[0].authorized, false);
                callback(null);
            });
        });

        it('fail if date is after end_date', function(callback) {
            var params = {
                mode: 'Exam',
                role: 'TA',
                user_id: 1020,
                uid: 'person1@host.com',
                date: '2017-07-07 06:06:06-00',
                use_date_check: true,
                aar_id: 1,
            };

            sqldb.query(sql.caar_test, params, (err, result) => {
                if (ERR(err, callback)) return;
                assert.strictEqual(result.rows[0].authorized, false);
                callback(null);
            });
        });

    });

    describe('check_assessment_access scheduler tests', function() {

        before('set up testing server', helperDb.before);
        after('tear down testing database', helperDb.after);

        before('setup sample environment', function(callback) {
            sqldb.query(sql.setup_caa_scheduler_tests, {}, (err, _result) => {
                if (ERR(err, callback)) return;
                callback(null);
            });
        });

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
                caa_reservation_tests(21, 2, 23, false, true);
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
                caa_reservation_tests(41, 4, 43, false, true);
            });
            describe('Linked exam in different PS course', () => {
                caa_reservation_tests(42, 5, 43, false, false);
            });
        });
    });
});
*/
