import { assert } from 'chai';

import { MemoryStore } from './memory-store';
import { loadSession, makeSession } from './session';

describe('session', () => {
  describe('loadSession', () => {
    it('loads session that does not exist', async () => {
      const store = new MemoryStore();

      const req = {} as any;
      const session = await loadSession('123', req, store);

      assert.equal(session.id, '123');
    });

    it('loads session from store', async () => {
      const store = new MemoryStore();
      await store.set('123', { foo: 'bar' });

      const req = {} as any;
      const session = await loadSession('123', req, store);

      assert.equal(session.id, '123');
      assert.equal(session.foo, 'bar');
    });

    it('does not try to overwrite existing session properties', async () => {
      const store = new MemoryStore();
      await store.set('123', { foo: 'bar', id: '456' });

      const req = {} as any;
      const session = await loadSession('123', req, store);

      assert.equal(session.id, '123');
      assert.equal(session.foo, 'bar');
    });
  });

  describe('makeSession', () => {
    it('has immutable properties', () => {
      const store = new MemoryStore();

      const req = {} as any;
      const session = makeSession('123', req, store);

      assert.equal(session.id, '123');

      const originalId = session.id;
      const originalDestroy = session.destroy;
      const originalRegenerate = session.regenerate;

      assert.throw(() => {
        session.id = '456';
      });

      assert.throw(() => {
        session.destroy = async () => {};
      });

      assert.throw(() => {
        session.regenerate = async () => {};
      });

      assert.equal(session.id, originalId);
      assert.equal(session.destroy, originalDestroy);
      assert.equal(session.regenerate, originalRegenerate);
    });

    it('has immutable destroy property', async () => {
      const store = new MemoryStore();

      const req = {} as any;
      const session = makeSession('123', req, store);

      assert.throw(() => {
        session.destroy = async () => {};
      });
    });

    it('can destroy itself', async () => {
      const store = new MemoryStore();

      const req = {} as any;
      const session = makeSession('123', req, store);
      req.session = session;

      await session.destroy();

      assert.isUndefined(req.session);
      assert.isNull(await store.get('123'));
    });

    it('can regenerate itself', async () => {
      const store = new MemoryStore();

      const req = {} as any;
      const session = makeSession('123', req, store);
      req.session = session;

      await session.regenerate();

      assert.notEqual(req.session, session);
      assert.notEqual(req.session.id, '123');
      assert.isNull(await store.get('123'));
    });
  });

  it('has cookie property', () => {});
});
