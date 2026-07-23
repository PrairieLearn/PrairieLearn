import type { Request, Response } from 'express';
import { afterAll, assert, beforeAll, describe, it } from 'vitest';

import * as helperDb from '../tests/helperDb.js';
import { withConfig } from '../tests/utils/config.js';

import { loadUser } from './authn.js';

function attachSession(
  req: Partial<Request>,
  data: Partial<Request['session']> = {},
  onRegenerate?: () => void,
) {
  req.session = {
    id: 'test-session',
    ...data,
    destroy: async () => {},
    regenerate: async () => {
      onRegenerate?.();
      attachSession(req, {}, onRegenerate);
    },
    setExpiration: () => {},
    getExpirationDate: () => new Date(Date.now() + 60_000),
  };
}

function makeReq(onRegenerate?: () => void) {
  const req: Partial<Request> = {
    cookies: {},
    ip: '127.0.0.1',
  };
  attachSession(req, {}, onRegenerate);
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

  it('does not consume pending LTI state during middleware session reloads', async () => {
    const req = makeReq();
    const res = makeRes();
    await loadTestUser(req, res);

    req.session.pending_lti13_auth = { marker: 'pending' };
    req.session.lti13_claims = { sub: 'pending-sub' };

    await withConfig({ isEnterprise: true }, async () => {
      await loadUser(
        req,
        res,
        {
          user_id: req.session.user_id,
          provider: req.session.authn_provider_name,
        },
        { preserveLockdownBrowser: true },
      );
    });

    assert.deepEqual(req.session.pending_lti13_auth, { marker: 'pending' });
    assert.deepEqual(req.session.lti13_claims, { sub: 'pending-sub' });
  });

  it('regenerates the session when elevating to LockDown Browser state', async () => {
    let regenerateCount = 0;
    const req = makeReq(() => {
      regenerateCount += 1;
    });
    const res = makeRes();

    await loadTestUser(req, res);
    assert.equal(regenerateCount, 1);
    assert.equal(req.session.lockdown_browser, false);

    await loadUser(
      req,
      res,
      {
        user_id: req.session.user_id,
        provider: 'PrairieTest',
      },
      { lockdownBrowser: true },
    );

    assert.equal(regenerateCount, 2);
    assert.equal(req.session.lockdown_browser, true);
  });
});
