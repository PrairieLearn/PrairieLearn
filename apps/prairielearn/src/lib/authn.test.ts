import type { Request, Response } from 'express';
import { afterAll, assert, beforeAll, describe, it } from 'vitest';

import * as helperDb from '../tests/helperDb.js';

import { loadUser } from './authn.js';

function attachSession(req: Partial<Request>, data: Partial<Request['session']> = {}) {
  req.session = {
    id: 'test-session',
    ...data,
    destroy: async () => {},
    regenerate: async () => {
      attachSession(req);
    },
    setExpiration: () => {},
    getExpirationDate: () => new Date(Date.now() + 60_000),
  };
}

function makeReq() {
  const req: Partial<Request> = {
    cookies: {},
    ip: '127.0.0.1',
  };
  attachSession(req);
  return req as Request;
}

function makeRes() {
  return {
    locals: {},
  } as Response;
}

async function loadTestUser(req: Request, res: Response, options = {}) {
  return await loadUser(
    req,
    res,
    {
      uid: 'lockdown-browser-session-test@example.com',
      name: 'LockDown Browser Session Test',
      uin: null,
      provider: 'dev',
    },
    options,
  );
}

describe('loadUser', () => {
  beforeAll(helperDb.before);

  afterAll(helperDb.after);

  it('clears LockDown Browser state when explicit auth omits it', async () => {
    const req = makeReq();
    const res = makeRes();

    await loadTestUser(req, res, { lockdownBrowser: true });
    assert.equal(req.session.lockdown_browser, true);

    await loadTestUser(req, res);

    assert.equal(req.session.lockdown_browser, false);
  });

  it('preserves LockDown Browser state during middleware session reloads', async () => {
    const req = makeReq();
    const res = makeRes();

    await loadTestUser(req, res, { lockdownBrowser: true });
    assert.equal(req.session.lockdown_browser, true);

    await loadUser(
      req,
      res,
      {
        user_id: req.session.user_id,
        provider: req.session.authn_provider_name,
      },
      { preserveLockdownBrowser: true },
    );

    assert.equal(req.session.lockdown_browser, true);
  });
});
