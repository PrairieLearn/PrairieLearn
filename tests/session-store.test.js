const assert = require('chai').assert;
const { step } = require('mocha-steps');
const { promisify } = require('util');

const SessionStore = require('../lib/session-store');
const sessionStoreExpire = require('../cron/sessionStoreExpire');
const helperDb = require('./helperDb');
const sqldb = require('@prairielearn/postgres');

let store = new SessionStore({ expireSeconds: 300 });

describe('session-store', function () {
  this.timeout(20000);

  before('set up testing database', helperDb.before);
  after('tear down testing database', helperDb.after);

  describe('basic functions', () => {
    step('set() 5 sessions', async () => {
      await promisify(store.set)('sid1', { value: 1 });
      await promisify(store.set)('sid2', { value: 2 });
      await promisify(store.set)('sid3', { value: 3 });
      await promisify(store.set)('sid4', { value: 4 });
      await promisify(store.set)('sid5', { value: 5 });
    });

    step('all() returns list of 5', async () => {
      let result = await promisify(store.all)();
      assert.isArray(result);
      assert.lengthOf(result, 5);
    });

    step('length() returns 5', async () => {
      let result = await promisify(store.length)();
      assert.equal(result, 5);
    });

    step('get() returns accurate data', async () => {
      let result = await promisify(store.get)('sid1');
      assert.deepEqual(result, { value: 1 });
      result = await promisify(store.get)('sid2');
      assert.deepEqual(result, { value: 2 });
      result = await promisify(store.get)('sid3');
      assert.deepEqual(result, { value: 3 });
      result = await promisify(store.get)('sid4');
      assert.deepEqual(result, { value: 4 });
      result = await promisify(store.get)('sid5');
      assert.deepEqual(result, { value: 5 });
    });

    step("destroy('sid1') succeeds", async () => {
      await promisify(store.destroy)('sid1');
    });

    step(
      "destroy('sid1') succeeds again, no error on destroying not present sessions",
      async () => {
        await promisify(store.destroy)('sid1');
      }
    );

    step("get('sid1') returns null when called on not present session", async () => {
      let result = await promisify(store.get)('sid1');
      assert.isNull(result);
    });

    step("touch('sid2') succeeds", async () => {
      await promisify(store.touch)('sid2', { value: '2 touched' });
      let result = await promisify(store.get)('sid2');
      assert.deepEqual(result, { value: '2 touched' });
    });

    step('clear() succeeds', async () => {
      await promisify(store.clear)();
    });

    step('all() returns empty list', async () => {
      let result = await promisify(store.all)();
      assert.isArray(result);
      assert.lengthOf(result, 0);
    });
  });

  describe('expiration functionality', () => {
    step('set() 1 session, mark old, get() should return null', async () => {
      await promisify(store.set)('expire1', { value: 1 });

      await sqldb.queryAsync(
        `UPDATE pl_sessions SET updated_at = '1900-01-01 00:00:00'
                WHERE sid='expire1'`,
        {}
      );
      let result = await promisify(store.get)('expire1');
      assert.isNull(result);
    });

    step('set() 5 sessions', async () => {
      await promisify(store.set)('sid1', { value: 1 });
      await promisify(store.set)('sid2', { value: 2 });
      await promisify(store.set)('sid3', { value: 3 });
      await promisify(store.set)('sid4', { value: 4 });
      await promisify(store.set)('sid5', { value: 5 });
    });

    step('set() 3 sessions, mark them old', async () => {
      await promisify(store.set)('expire2', 'old');
      await promisify(store.set)('expire3', 'old');
      await promisify(store.set)('expire4', 'old');

      await sqldb.queryAsync(
        `UPDATE pl_sessions SET updated_at = '1900-01-01 00:00:00' WHERE sid ~ 'expire';`,
        {}
      );
    });

    step('database has 8 rows', async () => {
      let result = await sqldb.queryAsync(`SELECT * FROM pl_sessions`, {});
      assert.equal(result.rowCount, 8);
    });

    step("get('expire2') should return null and remove from db", async () => {
      let result = await promisify(store.get)('expire2');
      assert.isNull(result);
    });

    step('database has 7 rows', async () => {
      let result = await sqldb.queryAsync(`SELECT * FROM pl_sessions`, {});
      assert.equal(result.rowCount, 7);
    });

    step('all() returns list of 5', async () => {
      let result = await promisify(store.all)();
      assert.isArray(result);
      assert.lengthOf(result, 5);
    });

    step('length() returns 5', async () => {
      let result = await promisify(store.length)();
      assert.equal(result, 5);
    });

    step('mark all sessions in db as old', async () => {
      await sqldb.queryAsync(`UPDATE pl_sessions SET updated_at = '1900-01-01 00:00:00';`, {});
    });

    step('set() 1 session', async () => {
      await promisify(store.set)('sid1', { value: 1 });
    });

    step('run cron, database should have 1 row', async () => {
      await promisify(sessionStoreExpire.run)();

      let result = await sqldb.queryAsync(`SELECT * FROM pl_sessions`, {});
      assert.equal(result.rowCount, 1);
    });
  });
});
