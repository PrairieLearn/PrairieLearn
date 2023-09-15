import { assert } from 'chai';

import { flashMiddleware, flash } from './index';

describe('flash', () => {
  it('throws an error if no session present', () => {
    assert.throw(() => {
      flashMiddleware()({} as any, {} as any, () => {});
    });
  });

  it('throws an error when middleware is not used', () => {
    assert.throw(() => {
      flash('notice', 'Hello world');
    });
  });

  it('adds a flash', () => {
    const req = {
      session: {},
    } as any;
    const res = {} as any;

    flashMiddleware()(req, res, () => {
      flash('notice', 'hello world');

      assert.sameDeepMembers(flash(), [{ type: 'notice', message: 'hello world' }]);
    });
  });

  it('stores multiples flashes with the same type', () => {
    const req = {
      session: {},
    } as any;
    const res = {} as any;

    flashMiddleware()(req, res, () => {
      flash('notice', 'hello world');
      flash('notice', 'goodbye world');

      assert.sameDeepMembers(flash(), [
        { type: 'notice', message: 'hello world' },
        { type: 'notice', message: 'goodbye world' },
      ]);
    });
  });

  it('returns flash message for a given type', () => {
    const req = {
      session: {},
    } as any;
    const res = {} as any;

    flashMiddleware()(req, res, () => {
      flash('notice', 'hello world');
      flash('error', 'goodbye world');

      assert.sameDeepMembers(flash('notice'), [{ type: 'notice', message: 'hello world' }]);
      assert.sameDeepMembers(flash('error'), [{ type: 'error', message: 'goodbye world' }]);
    });
  });

  it('returns all flashes', () => {
    const req = {
      session: {},
    } as any;
    const res = {} as any;

    flashMiddleware()(req, res, () => {
      flash('notice', 'hello world');
      flash('error', 'goodbye world');

      assert.sameDeepMembers(flash(), [
        { type: 'notice', message: 'hello world' },
        { type: 'error', message: 'goodbye world' },
      ]);
    });
  });

  it('clears flash after it has been read', () => {
    const req = {
      session: {},
    } as any;
    const res = {} as any;

    flashMiddleware()(req, res, () => {
      flash('notice', 'hello world');
      flash('error', 'goodbye world');

      assert.sameDeepMembers(flash('notice'), [{ type: 'notice', message: 'hello world' }]);
      assert.sameDeepMembers(flash('error'), [{ type: 'error', message: 'goodbye world' }]);

      assert.deepEqual(flash('notice'), []);
      assert.deepEqual(flash('error'), []);
      assert.isEmpty(flash());
    });
  });
});
