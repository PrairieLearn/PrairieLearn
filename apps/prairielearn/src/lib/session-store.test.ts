import { assert } from 'chai';

import { loadSqlEquiv, queryRow } from '@prairielearn/postgres';

import { generateUser } from '../models/user.js';
import * as helperDb from '../tests/helperDb.js';

import { UserSessionSchema } from './db-types.js';
import { PostgresSessionStore } from './session-store.js';

const sql = loadSqlEquiv(import.meta.url);

describe('PostgresSessionStore', () => {
  before(helperDb.before);
  after(helperDb.after);

  it('creates, updates, and destroys a session', async () => {
    await helperDb.runInTransactionAndRollback(async () => {
      const store = new PostgresSessionStore();
      let expiresAt = new Date(Date.now() + 10_000);

      await store.set('1', { foo: 'bar' }, expiresAt);

      let session = await store.get('1');

      assert(session);
      assert.deepEqual(session.data, { foo: 'bar' });
      assert.deepEqual(session.expiresAt, expiresAt);

      expiresAt = new Date(Date.now() + 20_000);

      await store.set('1', { bar: 'baz' }, expiresAt);

      session = await store.get('1');

      assert(session);
      assert.deepEqual(session.data, { bar: 'baz' });
      assert.deepEqual(session.expiresAt, expiresAt);

      await store.destroy('1');

      session = await store.get('1');

      assert.isNull(session);
    });
  });

  it('does not return expired sessions', async () => {
    await helperDb.runInTransactionAndRollback(async () => {
      const store = new PostgresSessionStore();
      const expiresAt = new Date(Date.now() - 10_000);

      await store.set('1', { foo: 'bar' }, expiresAt);

      const session = await store.get('1');

      assert.isNull(session);
    });
  });

  it('persists user_id when present', async () => {
    await helperDb.runInTransactionAndRollback(async () => {
      const store = new PostgresSessionStore();
      const expiresAt = new Date(Date.now() + 10_000);

      const user = await generateUser();

      await store.set('1', { foo: 'bar', user_id: user.user_id }, expiresAt);

      const session = await store.get('1');

      assert(session);
      assert.deepEqual(session.data, { foo: 'bar', user_id: user.user_id });
      assert.deepEqual(session.expiresAt, expiresAt);

      const userSession = await queryRow(
        sql.select_user_session_by_session_id,
        { session_id: '1' },
        UserSessionSchema,
      );

      assert.equal(userSession.user_id, user.user_id);
    });
  });
});
