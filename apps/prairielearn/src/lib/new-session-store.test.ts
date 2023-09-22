import { assert } from 'chai';

import helperDb = require('../tests/helperDb');
import { NewSessionStore } from './new-session-store';

describe('new-session-store', () => {
  before(helperDb.before);
  after(helperDb.after);

  it('creates, updates, and destroys a session', async () => {
    await helperDb.runInTransactionAndRollback(async () => {
      const store = new NewSessionStore();
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
      const store = new NewSessionStore();
      const expiresAt = new Date(Date.now() - 10_000);

      await store.set('1', { foo: 'bar' }, expiresAt);

      const session = await store.get('1');

      assert.isNull(session);
    });
  });
});
