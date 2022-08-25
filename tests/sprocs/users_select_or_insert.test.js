// @ts-check
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const _ = require('lodash');

const sqldb = require('../../prairielib/lib/sql-db');
const sqlLoader = require('../../prairielib/lib/sql-loader');
const helperDb = require('../helperDb');

chai.use(chaiAsPromised);
const { assert } = chai;

const sql = sqlLoader.loadSqlEquiv(__filename);

async function getUserParams(user_id) {
  const query = `select user_id, uid, name, uin, institution_id FROM users WHERE user_id = $1;`;
  const result = await sqldb.queryOneRowAsync(query, [user_id]);

  const u = result.rows[0];
  return [u.uid, u.name, u.uin, u.institution_id];
}

const baseParams = [
  // uid
  'user@host.com',
  // name
  'Joe User',
  // uin
  null,
  // authn_provider_name
  'Shibboleth',
  // institution_id
  null,
];

const baseUser = [
  // uid
  'user@host.com',
  // name
  'Joe User',
  // uin
  null,
  // institution_id
  '1',
];

describe('sproc users_select_or_insert tests', () => {
  before('set up testing server', helperDb.before);
  after('tear down testing database', helperDb.after);

  it('create new user', async () => {
    const params = _.clone(baseParams);
    const user = _.clone(baseUser);

    const result = await sqldb.callAsync('users_select_or_insert', params);

    const user_id = result.rows[0].user_id;
    assert.equal(user_id, 1);

    const fromdb = await getUserParams(user_id);
    assert.deepEqual(user, fromdb);
  });

  it('create new user again, confirm info is the same', async () => {
    const params = _.clone(baseParams);
    const user = _.clone(baseUser);

    const result = await sqldb.callAsync('users_select_or_insert', params);

    const user_id = result.rows[0].user_id;
    assert.equal(user_id, 1);

    const fromdb = await getUserParams(user_id);
    assert.deepEqual(user, fromdb);
  });

  it('user 1 updates name', async () => {
    const params = _.clone(baseParams);
    const user = _.clone(baseUser);

    params[1] = 'J.R. User';
    user[1] = params[1];

    const result = await sqldb.callAsync('users_select_or_insert', params);

    const user_id = result.rows[0].user_id;
    assert.equal(user_id, 1);

    const fromdb = await getUserParams(user_id);
    assert.deepEqual(user, fromdb);
  });

  it('add an institution for host.com', async () => {
    await sqldb.queryAsync(sql.insert_host_com, []);
  });

  it('user 1 updates institution_id', async () => {
    const params = _.clone(baseParams);
    const user = _.clone(baseUser);

    user[3] = '100';

    const result = await sqldb.callAsync('users_select_or_insert', params);

    const user_id = result.rows[0].user_id;
    assert.equal(user_id, 1);

    const fromdb = await getUserParams(user_id);
    assert.deepEqual(user, fromdb);
  });

  it('user 1 updates uin when uin was null', async () => {
    const params = _.clone(baseParams);
    const user = _.clone(baseUser);

    params[2] = '111122223';
    user[2] = params[2];
    user[3] = '100';

    const result = await sqldb.callAsync('users_select_or_insert', params);

    const user_id = result.rows[0].user_id;
    assert.equal(user_id, 1);

    const fromdb = await getUserParams(user_id);
    assert.deepEqual(user, fromdb);
  });

  it('user 1 updates uin when uin was value', async () => {
    const params = _.clone(baseParams);
    const user = _.clone(baseUser);

    params[2] = '111122224';
    user[2] = params[2];
    user[3] = '100';

    const result = await sqldb.callAsync('users_select_or_insert', params);

    const user_id = result.rows[0].user_id;
    assert.equal(user_id, 1);

    const fromdb = await getUserParams(user_id);
    assert.deepEqual(user, fromdb);
  });

  it('user 1 updates uid with already present uin', async () => {
    const params = _.clone(baseParams);
    const user = _.clone(baseUser);

    params[0] = 'newuid@host.com';
    params[2] = '111122224';
    user[0] = params[0];
    user[2] = params[2];
    user[3] = '100';

    const result = await sqldb.callAsync('users_select_or_insert', params);

    const user_id = result.rows[0].user_id;
    assert.equal(user_id, 1);

    const fromdb = await getUserParams(user_id);
    assert.deepEqual(user, fromdb);
  });

  it('user 2 create under Shibboleth', async () => {
    const params = ['joe@illinois.edu', 'Joe Bob', '444444444', 'Shibboleth', null];
    const user = _.clone(params);

    user[3] = '1';

    const result = await sqldb.callAsync('users_select_or_insert', params);

    const user_id = result.rows[0].user_id;
    assert.equal(user_id, 2);

    const fromdb = await getUserParams(user_id);
    assert.deepEqual(user, fromdb);
  });

  it('add an institution for illinois.edu', async () => {
    await sqldb.queryAsync(sql.insert_illinois_edu, []);
  });

  it('user 2 logs in via Google', async () => {
    const params = ['joe@illinois.edu', 'joe@illinois.edu', null, 'Google', null];
    const user = _.clone(params);

    user[2] = '444444444';
    user[3] = '200';

    const result = await sqldb.callAsync('users_select_or_insert', params);

    const user_id = result.rows[0].user_id;
    assert.equal(user_id, 2);

    const fromdb = await getUserParams(user_id);
    assert.deepEqual(user, fromdb);
  });

  it('user 2 fails to log in via Azure', async () => {
    const params = ['joe@illinois.edu', 'joe@illinois.edu', null, 'Azure'];

    await assert.isRejected(sqldb.callAsync('users_select_or_insert', params));
  });

  it('user 3 create under Google', async () => {
    const params = ['sally@illinois.edu', 'sally@illinois.edu', null, 'Google'];
    const user = _.clone(params);

    user[3] = '200';

    const result = await sqldb.callAsync('users_select_or_insert', params);

    const user_id = result.rows[0].user_id;
    assert.equal(user_id, 3);

    const fromdb = await getUserParams(user_id);
    assert.deepEqual(user, fromdb);
  });

  it('user 3 logs in via Shibboleth', async () => {
    const params = ['sally@illinois.edu', 'Sally Ann', '555566665', 'Shibboleth'];
    const user = _.clone(params);

    user[3] = '200';

    const result = await sqldb.callAsync('users_select_or_insert', params);

    const user_id = result.rows[0].user_id;
    assert.equal(user_id, 3);

    const fromdb = await getUserParams(user_id);
    assert.deepEqual(user, fromdb);
  });

  it('user 3 logs back in via Google', async () => {
    const params = ['sally@illinois.edu', 'sally@illinois.edu', null, 'Google', null];
    const user = _.clone(params);

    user[2] = '555566665';
    user[3] = '200';

    const result = await sqldb.callAsync('users_select_or_insert', params);

    const user_id = result.rows[0].user_id;
    assert.equal(user_id, 3);

    const fromdb = await getUserParams(user_id);
    assert.deepEqual(user, fromdb);
  });

  it('user 4 created with wrong netid and correct UIN', async () => {
    const params = ['uin-888899990@illinois.edu', 'UIN 888899990', '888899990', 'Shibboleth', null];
    const user = _.clone(params);

    user[3] = '200';

    const result = await sqldb.callAsync('users_select_or_insert', params);

    const user_id = result.rows[0].user_id;
    assert.equal(user_id, 4);
    const fromdb = await getUserParams(user_id);
    assert.deepEqual(user, fromdb);
  });

  it('user 4 logs in with full correct credentials, no institution, account updated', async () => {
    const params = ['newstudent', 'Johnny New Student', '888899990', 'Shibboleth', null];
    const user = _.clone(params);

    user[3] = '1';

    const result = await sqldb.callAsync('users_select_or_insert', params);

    const user_id = result.rows[0].user_id;
    assert.equal(user_id, 4);

    const fromdb = await getUserParams(user_id);
    assert.deepEqual(user, fromdb);
  });
});
