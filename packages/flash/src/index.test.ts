import { assert, describe, it } from 'vitest';

import { html } from '@prairielearn/html';

import { flash, flashMiddleware } from './index.js';

describe('flash', () => {
  it('throws an error if no session present', () => {
    assert.throw(() => {
      flashMiddleware()({} as any, {} as any, () => {
        flash('notice', 'Hello world');
      });
    }, 'No session found on request');
  });

  it('throws an error when middleware is not used', () => {
    assert.throw(() => {
      flash('notice', 'Hello world');
    }, 'flash() must be called within a request');
    assert.throw(() => {
      flash('notice', html`<p>hello ${'&'} world</p>`);
    }, 'flash() must be called within a request');
  });

  it('adds a flash using string message', () => {
    const req = {
      session: {},
    } as any;
    const res = {} as any;

    flashMiddleware()(req, res, () => {
      flash('notice', 'hello world');

      assert.sameDeepMembers(flash(), [{ type: 'notice', message: 'hello world' }]);
    });
  });

  it('adds a flash and escapes unsafe HTML', () => {
    const req = {
      session: {},
    } as any;
    const res = {} as any;

    flashMiddleware()(req, res, () => {
      flash('notice', '<b>hello world</b>');

      assert.sameDeepMembers(flash(), [
        { type: 'notice', message: '&lt;b&gt;hello world&lt;/b&gt;' },
      ]);
    });
  });

  it('adds a flash with HTML-safe message', () => {
    const req = {
      session: {},
    } as any;
    const res = {} as any;

    flashMiddleware()(req, res, () => {
      flash('notice', html`<p>hello ${'&'} world</p>`);

      assert.sameDeepMembers(flash(), [{ type: 'notice', message: '<p>hello &amp; world</p>' }]);
    });
  });

  it('stores multiples flashes with the same type', () => {
    const req = {
      session: {},
    } as any;
    const res = {} as any;

    flashMiddleware()(req, res, () => {
      flash('notice', 'hello world');
      flash('notice', '<< goodbye world');
      flash('notice', html`<p>hello ${'&'} world</p>`);

      assert.sameDeepMembers(flash(), [
        { type: 'notice', message: 'hello world' },
        { type: 'notice', message: '&lt;&lt; goodbye world' },
        { type: 'notice', message: '<p>hello &amp; world</p>' },
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
      flash('error', '<< goodbye world');
      flash('success', html`<p>hello ${'&'} world</p>`);

      assert.sameDeepMembers(flash('notice'), [{ type: 'notice', message: 'hello world' }]);
      assert.sameDeepMembers(flash('error'), [
        { type: 'error', message: '&lt;&lt; goodbye world' },
      ]);
      assert.sameDeepMembers(flash('success'), [
        { type: 'success', message: '<p>hello &amp; world</p>' },
      ]);
    });
  });

  it('returns all flashes', () => {
    const req = {
      session: {},
    } as any;
    const res = {} as any;

    flashMiddleware()(req, res, () => {
      flash('notice', 'hello world');
      flash('error', '<< goodbye world');
      flash('success', html`<p>hello ${'&'} world</p>`);

      assert.sameDeepMembers(flash(), [
        { type: 'notice', message: 'hello world' },
        { type: 'error', message: '&lt;&lt; goodbye world' },
        { type: 'success', message: '<p>hello &amp; world</p>' },
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
      flash('error', '<< goodbye world');
      flash('success', html`<p>hello ${'&'} world</p>`);

      assert.sameDeepMembers(flash('notice'), [{ type: 'notice', message: 'hello world' }]);
      assert.sameDeepMembers(flash('error'), [
        { type: 'error', message: '&lt;&lt; goodbye world' },
      ]);
      assert.sameDeepMembers(flash('success'), [
        { type: 'success', message: '<p>hello &amp; world</p>' },
      ]);

      assert.deepEqual(flash('notice'), []);
      assert.deepEqual(flash('error'), []);
      assert.deepEqual(flash('success'), []);
      assert.isEmpty(flash());
    });
  });
});
