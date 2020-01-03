var ERR = require('async-stacktrace');
var assert = require('chai').assert;
var debug = require('debug')('prairielearn:testSproc-users_select_or_insert');
var _ = require('lodash');

var sqldb = require('@prairielearn/prairielib').sqldb;
var sqlLoader = require('@prairielearn/prairielib').sqlLoader;
var sql = sqlLoader.loadSqlEquiv(__filename);
var helperDb = require('./helperDb');

var get_user_params = (user_id, callback) => {

    var search = `select user_id, uid, name, uin, institution_id FROM users WHERE user_id = $1;`;
    sqldb.queryOneRow(search, [user_id], (err, result) => {
        if (ERR(err, callback)) return;

        var u = result.rows[0];
        debug(u);
        callback(null, [u.uid, u.name, u.uin, u.institution_id]);
    });
};
                  // uid,             name,      uin,  authn_provider_name
var base_params = [ 'user@host.com', 'Joe User', null, 'Shibboleth' ];

                  // uid,             name,      uin,  institution_id
var base_user =   [ 'user@host.com', 'Joe User', null, '1' ];

describe('sproc users_select_or_insert tests', () => {

    before('set up testing server', helperDb.before);
    after('tear down testing database', helperDb.after);

    it('create new user', (callback) => {
        var params = _.clone(base_params);
        var user = _.clone(base_user);

        sqldb.call('users_select_or_insert', params, (err, result) => {
            if (ERR(err, callback)) return;

            var user_id = result.rows[0].user_id;
            assert.equal(user_id, 1);

            get_user_params(user_id, (err, fromdb) => {
                if (ERR(err, callback)) return;
                assert.deepEqual(user, fromdb);
                callback(null);
            });
        });
    });

    it('create new user again, confirm info is the same', (callback) => {
        var params = _.clone(base_params);
        var user = _.clone(base_user);

        sqldb.call('users_select_or_insert', params, (err, result) => {
            if (ERR(err, callback)) return;

            var user_id = result.rows[0].user_id;
            assert.equal(user_id, 1);

            get_user_params(user_id, (err, fromdb) => {
                if (ERR(err, callback)) return;
                assert.deepEqual(user, fromdb);
                callback(null);
            });
        });
    });

    it('user 1 updates name', (callback) => {
        var params = _.clone(base_params);
        var user = _.clone(base_user);

        params[1] = 'J.R. User';
        user[1] = params[1];

        sqldb.call('users_select_or_insert', params, (err, result) => {
            if (ERR(err, callback)) return;

            var user_id = result.rows[0].user_id;
            assert.equal(user_id, 1);
            get_user_params(user_id, (err, fromdb) => {
                if (ERR(err, callback)) return;
                assert.deepEqual(user, fromdb);
                callback(null);
            });
        });
    });

    it('add an institution for host.com', (callback) => {
        sqldb.query(sql.insert_host_com, [], (err, _result) => {
            if (ERR(err, callback)) return;
            callback(null);
        });
    });

    it('user 1 updates institution_id', (callback) => {
        var params = _.clone(base_params);
        var user = _.clone(base_user);

        user[3] = '100';

        sqldb.call('users_select_or_insert', params, (err, result) => {
            if (ERR(err, callback)) return;

            var user_id = result.rows[0].user_id;
            assert.equal(user_id, 1);
            get_user_params(user_id, (err, fromdb) => {
                if (ERR(err, callback)) return;
                assert.deepEqual(user, fromdb);
                callback(null);
            });
        });
    });

    it('user 1 updates uin when uin was null', (callback) => {
        var params = _.clone(base_params);
        var user = _.clone(base_user);

        params[2] = '111122223';
        user[2] = params[2];
        user[3] = '100';

        sqldb.call('users_select_or_insert', params, (err, result) => {
            if (ERR(err, callback)) return;

            var user_id = result.rows[0].user_id;
            assert.equal(user_id, 1);
            get_user_params(user_id, (err, fromdb) => {
                if (ERR(err, callback)) return;
                assert.deepEqual(user, fromdb);
                callback(null);
            });
        });
    });

    it('user 1 updates uin when uin was value', (callback) => {
        var params = _.clone(base_params);
        var user = _.clone(base_user);

        params[2] = '111122224';
        user[2] = params[2];
        user[3] = '100';

        sqldb.call('users_select_or_insert', params, (err, result) => {
            if (ERR(err, callback)) return;

            var user_id = result.rows[0].user_id;
            assert.equal(user_id, 1);
            get_user_params(user_id, (err, fromdb) => {
                if (ERR(err, callback)) return;
                assert.deepEqual(user, fromdb);
                callback(null);
            });
        });
    });

    it('user 1 updates uid with already present uin', (callback) => {
        var params = _.clone(base_params);
        var user = _.clone(base_user);

        params[0] = 'newuid@host.com';
        params[2] = '111122224';
        user[0] = params[0];
        user[2] = params[2];
        user[3] = '100';

        sqldb.call('users_select_or_insert', params, (err, result) => {
            if (ERR(err, callback)) return;

            var user_id = result.rows[0].user_id;
            assert.equal(user_id, 1);
            get_user_params(user_id, (err, fromdb) => {
                if (ERR(err, callback)) return;
                assert.deepEqual(user, fromdb);
                callback(null);
            });
        });
    });

    it('user 2 create under Shibboleth', (callback) => {
        var params = ['joe@illinois.edu', 'Joe Bob', '444444444', 'Shibboleth'];
        var user = _.clone(params);

        user[3] = '1';

        sqldb.call('users_select_or_insert', params, (err, result) => {
            if (ERR(err, callback)) return;

            var user_id = result.rows[0].user_id;
            assert.equal(user_id, 2);
            get_user_params(user_id, (err, fromdb) => {
                if (ERR(err, callback)) return;
                assert.deepEqual(user, fromdb);
                callback(null);
            });
        });
    });

    it('add an institution for illinois.edu', (callback) => {
        sqldb.query(sql.insert_illinois_edu, [], (err, _result) => {
            if (ERR(err, callback)) return;
            callback(null);
        });
    });

    it('user 2 logs in via Google', (callback) => {
        var params = ['joe@illinois.edu', 'joe@illinois.edu', null, 'Google'];
        var user = _.clone(params);

        user[2] = '444444444';
        user[3] = '200';

        sqldb.call('users_select_or_insert', params, (err, result) => {
            if (ERR(err, callback)) return;

            var user_id = result.rows[0].user_id;
            assert.equal(user_id, 2);
            get_user_params(user_id, (err, fromdb) => {
                if (ERR(err, callback)) return;
                assert.deepEqual(user, fromdb);
                callback(null);
            });
        });
    });

    it('user 2 fails to log in via Azure', (callback) => {
        var params = ['joe@illinois.edu', 'joe@illinois.edu', null, 'Azure'];

        sqldb.call('users_select_or_insert', params, (err, _result) => {
            if (err == null) {
                return callback(new Error('users_select_or_insert succeeded'));
            }
            callback(null);
        });
    });

    it('user 3 create under Google', (callback) => {
        var params = ['sally@illinois.edu', 'sally@illinois.edu', null, 'Google'];
        var user = _.clone(params);

        user[3] = '200';

        sqldb.call('users_select_or_insert', params, (err, result) => {
            if (ERR(err, callback)) return;

            var user_id = result.rows[0].user_id;
            assert.equal(user_id, 3);
            get_user_params(user_id, (err, fromdb) => {
                if (ERR(err, callback)) return;
                assert.deepEqual(user, fromdb);
                callback(null);
            });
        });
    });

    it('user 3 logs in via Shibboleth', (callback) => {
        var params = ['sally@illinois.edu', 'Sally Ann', '555566665', 'Shibboleth'];
        var user = _.clone(params);

        user[3] = '200';

        sqldb.call('users_select_or_insert', params, (err, result) => {
            if (ERR(err, callback)) return;

            var user_id = result.rows[0].user_id;
            assert.equal(user_id, 3);
            get_user_params(user_id, (err, fromdb) => {
                if (ERR(err, callback)) return;
                assert.deepEqual(user, fromdb);
                callback(null);
            });
        });
    });

    it('user 3 logs back in via Google', (callback) => {
        var params = ['sally@illinois.edu', 'sally@illinois.edu', null, 'Google'];
        var user = _.clone(params);

        user[2] = '555566665';
        user[3] = '200';

        sqldb.call('users_select_or_insert', params, (err, result) => {
            if (ERR(err, callback)) return;

            var user_id = result.rows[0].user_id;
            assert.equal(user_id, 3);
            get_user_params(user_id, (err, fromdb) => {
                if (ERR(err, callback)) return;
                assert.deepEqual(user, fromdb);
                callback(null);
            });
        });
    });

    it('user 4 created with wrong netid and correct UIN', (callback) => {
        var params = ['uin-888899990@illinois.edu', 'UIN 888899990', '888899990', 'Shibboleth'];
        var user = _.clone(params);

        user[3] = '200';

        sqldb.call('users_select_or_insert', params, (err, result) => {
            if (ERR(err, callback)) return;

            var user_id = result.rows[0].user_id;
            assert.equal(user_id, 4);
            get_user_params(user_id, (err, fromdb) => {
                if (ERR(err, callback)) return;
                assert.deepEqual(user, fromdb);
                callback(null);
            });
        });
    });

    it('user 4 logs in with full correct credentials, no institution, account updated', (callback) => {
        var params = ['newstudent', 'Johnny New Student', '888899990', 'Shibboleth'];
        var user = _.clone(params);

        user[3] = '1';

        sqldb.call('users_select_or_insert', params, (err, result) => {
            if (ERR(err, callback)) return;

            var user_id = result.rows[0].user_id;
            assert.equal(user_id, 4);
            get_user_params(user_id, (err, fromdb) => {
                if (ERR(err, callback)) return;
                assert.deepEqual(user, fromdb);
                callback(null);
            });
        });
    });
});
