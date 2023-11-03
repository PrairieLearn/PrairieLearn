import express = require('express');
import { assert } from 'chai';
import fetch from 'node-fetch';
import { parse as parseSetCookie, splitCookiesString } from 'set-cookie-parser';
import cookieParser = require('cookie-parser');
import { withServer } from '@prairielearn/express-test-utils';

import { makeCookieMigrationMiddleware } from './cookie';

describe('migrateCookiesIfNeededMiddleware', () => {
  it('migrates cookies', async () => {
    const app = express();
    app.use(cookieParser());
    app.use(makeCookieMigrationMiddleware(true));
    app.get('/', (_req, res) => res.sendStatus(200));

    await withServer(app, async ({ url }) => {
      const res = await fetch(url, {
        headers: {
          cookie: 'pl_authn=foo; pl_authz_workspace_1234=bar',
        },
        redirect: 'manual',
      });
      assert.equal(res.status, 307);

      const header = res.headers.get('set-cookie');
      const cookies = parseSetCookie(splitCookiesString(header ?? ''));
      assert.equal(cookies.length, 2);
      assert.equal(cookies[0].name, 'pl2_authn');
      assert.equal(cookies[0].value, 'foo');
      assert.equal(cookies[0].httpOnly, true);
      assert.equal(cookies[1].name, 'pl2_authz_workspace_1234');
      assert.equal(cookies[1].value, 'bar');
      assert.equal(cookies[1].httpOnly, true);
    });
  });

  it('does nothing if cookies are already migrated', async () => {
    const app = express();
    app.use(cookieParser());
    app.use(makeCookieMigrationMiddleware(true));
    app.get('/', (_req, res) => res.sendStatus(200));

    await withServer(app, async ({ url }) => {
      const res = await fetch(url, {
        headers: {
          cookie: 'pl2_authn=foo; pl2_authz_workspace_1234=bar',
        },
        redirect: 'manual',
      });
      assert.equal(res.status, 200);

      const header = res.headers.get('set-cookie');
      assert.isNull(header);
    });
  });

  it('rewrites cookies for the current request', async () => {
    const app = express();
    app.use(cookieParser());
    app.use(makeCookieMigrationMiddleware(false));
    app.get('/', (req, res) => res.status(200).json({ cookies: req.cookies }));

    await withServer(app, async ({ url }) => {
      const res = await fetch(url, {
        headers: {
          cookie: 'pl_authn=foo; pl_authz_workspace_1234=bar',
        },
        redirect: 'manual',
      });
      assert.equal(res.status, 200);

      const header = res.headers.get('set-cookie');
      assert.isNull(header);

      const body = await res.json();
      assert.equal(body.cookies.pl_authn, 'foo');
      assert.equal(body.cookies.pl_authz_workspace_1234, 'bar');
    });
  });
});
