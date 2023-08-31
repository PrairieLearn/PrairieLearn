import express from 'express';
import { assert } from 'chai';
import fetch from 'node-fetch';
import fetchCookie from 'fetch-cookie';
import { parse as parseSetCookie } from 'set-cookie-parser';
import asyncHandler from 'express-async-handler';

import { createSessionMiddleware } from './index';
import { MemoryStore } from './memory-store';
import { withServer } from './test-utils';

const TEST_SECRET = 'test-secret';

describe('session middleware', () => {
  it('sets a session cookie', async () => {
    const app = express();
    app.use(createSessionMiddleware({ secret: TEST_SECRET, store: new MemoryStore() }));
    app.get('/', (_req, res) => res.sendStatus(200));

    await withServer(app, async ({ url }) => {
      const res = await fetch(url);
      assert.equal(res.status, 200);

      const header = res.headers.get('set-cookie');
      const cookies = parseSetCookie(header ?? '');
      assert.equal(cookies.length, 1);
      assert.equal(cookies[0].name, 'session');
      assert.equal(cookies[0].path, '/');
    });
  });

  it('sets a session cookie with a custom name', async () => {
    const app = express();
    app.use(
      createSessionMiddleware({
        secret: TEST_SECRET,
        store: new MemoryStore(),
        cookie: {
          name: 'prairielearn_session',
        },
      }),
    );
    app.get('/', (_req, res) => res.sendStatus(200));

    await withServer(app, async ({ url }) => {
      const res = await fetch(url);
      assert.equal(res.status, 200);

      const header = res.headers.get('set-cookie');
      const cookies = parseSetCookie(header ?? '');
      assert.equal(cookies.length, 1);
      assert.equal(cookies[0].name, 'prairielearn_session');
      assert.equal(cookies[0].path, '/');
    });
  });

  it('sets a secure cookie', async () => {
    const app = express();
    app.use(
      createSessionMiddleware({
        secret: TEST_SECRET,
        store: new MemoryStore(),
        cookie: {
          secure: true,
        },
      }),
    );
    app.get('/', (_req, res) => res.sendStatus(200));

    await withServer(app, async ({ url }) => {
      const res = await fetch(url);
      assert.equal(res.status, 200);

      const header = res.headers.get('set-cookie');
      const cookies = parseSetCookie(header ?? '');
      assert.equal(cookies.length, 1);
      assert.equal(cookies[0].name, 'session');
      assert.equal(cookies[0].path, '/');
      assert.isTrue(cookies[0].secure);
    });
  });

  it('sets a secure cookie for proxied HTTPS request', async () => {
    const app = express();
    app.enable('trust proxy');
    app.use(
      createSessionMiddleware({
        secret: TEST_SECRET,
        store: new MemoryStore(),
        cookie: {
          secure: 'auto',
        },
      }),
    );
    app.get('/', (_req, res) => res.sendStatus(200));

    await withServer(app, async ({ url }) => {
      const res = await fetch(url, {
        headers: {
          'X-Forwarded-Proto': 'https',
        },
      });
      assert.equal(res.status, 200);

      const header = res.headers.get('set-cookie');
      const cookies = parseSetCookie(header ?? '');
      assert.equal(cookies.length, 1);
      assert.equal(cookies[0].name, 'session');
      assert.equal(cookies[0].path, '/');
      assert.isTrue(cookies[0].secure);
    });
  });

  it('sets a non-secure cookie for proxied HTTP request', async () => {
    const app = express();
    app.enable('trust proxy');
    app.use(
      createSessionMiddleware({
        secret: TEST_SECRET,
        store: new MemoryStore(),
        cookie: {
          secure: 'auto',
        },
      }),
    );
    app.get('/', (_req, res) => res.sendStatus(200));

    await withServer(app, async ({ url }) => {
      const res = await fetch(url, {
        headers: {
          'X-Forwarded-Proto': 'http',
        },
      });
      assert.equal(res.status, 200);

      const header = res.headers.get('set-cookie');
      const cookies = parseSetCookie(header ?? '');
      assert.equal(cookies.length, 1);
      assert.equal(cookies[0].name, 'session');
      assert.equal(cookies[0].path, '/');
      assert.isUndefined(cookies[0].secure);
    });
  });

  it('sets a secure cookie based on a custom function', async () => {
    const app = express();
    app.use(
      createSessionMiddleware({
        secret: TEST_SECRET,
        store: new MemoryStore(),
        cookie: {
          secure: () => true,
        },
      }),
    );
    app.get('/', (_req, res) => res.sendStatus(200));

    await withServer(app, async ({ url }) => {
      const res = await fetch(url);
      assert.equal(res.status, 200);

      const header = res.headers.get('set-cookie');
      const cookies = parseSetCookie(header ?? '');
      assert.equal(cookies.length, 1);
      assert.equal(cookies[0].name, 'session');
      assert.equal(cookies[0].path, '/');
      assert.isTrue(cookies[0].secure);
    });
  });

  it('persists session data across requests', async () => {
    const app = express();
    app.use(
      createSessionMiddleware({
        store: new MemoryStore(),
        secret: TEST_SECRET,
      }),
    );
    app.get('/', (req, res) => {
      req.session.count ??= 0;
      req.session.count += 1;
      res.send(req.session.count.toString());
    });

    await withServer(app, async ({ url }) => {
      const fetchWithCookies = fetchCookie(fetch);

      let res = await fetchWithCookies(url);
      assert.equal(res.status, 200);
      assert.equal(await res.text(), '1');

      res = await fetchWithCookies(url);
      assert.equal(res.status, 200);
      assert.equal(await res.text(), '2');
    });
  });

  it('commits the session before sending a redirect', async () => {
    const app = express();
    app.use(
      createSessionMiddleware({
        store: new MemoryStore({
          delay: 200,
        }),
        secret: TEST_SECRET,
      }),
    );
    app.post('/', (req, res) => {
      req.session.test = 'test';
      res.redirect(req.originalUrl);
    });
    app.get('/', (req, res) => {
      res.send(req.session.test ?? 'NO VALUE');
    });

    await withServer(app, async ({ url }) => {
      const res = await fetchCookie(fetch)(url, {
        method: 'POST',
      });
      assert.equal(res.status, 200);

      const body = await res.text();
      assert.equal(body, 'test');
    });
  });

  it('destroys session', async () => {
    const store = new MemoryStore();

    const app = express();
    app.use(
      createSessionMiddleware({
        store,
        secret: TEST_SECRET,
      }),
    );
    app.get('/', (_req, res) => res.sendStatus(200));
    app.use(
      '/destroy',
      asyncHandler(async (req, res) => {
        await req.session.destroy();
        res.sendStatus(200);
      }),
    );

    await withServer(app, async ({ url }) => {
      const fetchWithCookies = fetchCookie(fetch);

      // Generate a new session.
      await fetchWithCookies(url);

      // Destroy the session.
      const destroyRes = await fetchWithCookies(`${url}/destroy`);
      assert.equal(destroyRes.status, 200);

      // Ensure the session cookie was cleared in the response.
      const header = destroyRes.headers.get('set-cookie');
      const cookies = parseSetCookie(header ?? '');
      assert.equal(cookies.length, 1);
      assert.equal(cookies[0].name, 'session');
      assert.equal(cookies[0].path, '/');
      assert.equal(cookies[0].expires?.getTime(), 0);

      // Ensure the session was destroyed in the session store.
      const sessionId = cookies[0].value.split('.')[0];
      assert.isNull(await store.get(sessionId));
    });
  });

  it('regenerates session', async () => {
    const store = new MemoryStore();

    const app = express();
    app.use(
      createSessionMiddleware({
        store,
        secret: TEST_SECRET,
      }),
    );
    app.get('/', (req, res) => {
      res.send(req.session.regenerated ? 'true' : 'false');
    });
    app.get(
      '/regenerate',
      asyncHandler(async (req, res) => {
        await req.session.regenerate();
        req.session.regenerated = true;
        res.sendStatus(200);
      }),
    );

    await withServer(app, async ({ url }) => {
      const fetchWithCookies = fetchCookie(fetch);

      // Generate a new session.
      let res = await fetchWithCookies(url);
      assert.equal(res.status, 200);
      assert.equal(await res.text(), 'false');

      // Extract the original cookie value.
      let header = res.headers.get('set-cookie');
      let cookies = parseSetCookie(header ?? '');
      assert.equal(cookies.length, 1);
      const originalCookieValue = cookies[0].value;

      // Regenerate the session.
      res = await fetchWithCookies(`${url}/regenerate`);
      assert.equal(res.status, 200);

      // Ensure that the session cookie was changed.
      header = res.headers.get('set-cookie');
      cookies = parseSetCookie(header ?? '');
      assert.equal(cookies.length, 1);
      const newCookieValue = cookies[0].value;
      assert.notEqual(newCookieValue, originalCookieValue);

      // Ensure the original session is no longer present in the session store.
      const originalSessionId = originalCookieValue.split('.')[0];
      assert.isNull(await store.get(originalSessionId));

      // Ensure that the regenerated session data was persisted.
      res = await fetchWithCookies(url);
      assert.equal(res.status, 200);
      assert.equal(await res.text(), 'true');
    });
  });

  it('creates a new session if signature checks fail', async () => {
    const store = new MemoryStore();

    const app = express();
    app.use(
      createSessionMiddleware({
        store,
        secret: TEST_SECRET,
      }),
    );
    app.get('/', (req, res) => res.send(req.session.id));

    await withServer(app, async ({ url }) => {
      const cookieJar = new fetchCookie.toughCookie.CookieJar();
      const fetchWithCookies = fetchCookie(fetch, cookieJar);

      // Generate a new session.
      let res = await fetchWithCookies(url);
      assert.equal(res.status, 200);
      const originalSessionId = await res.text();

      // Tamper with the session cookie.
      const cookie = cookieJar.getCookiesSync(url)[0];
      cookie.value = 'tampered';
      cookieJar.setCookieSync(cookie, url);

      // Make sure we get a new session.
      res = await fetchWithCookies(url);
      assert.equal(res.status, 200);
      const newSessionId = await res.text();
      assert.notEqual(newSessionId, originalSessionId);

      // Make sure the existing session is still present in the store. We don't
      // want someone to be able to evict other sessions by submitting invalid
      // cookies.
      assert.isNotNull(await store.get(originalSessionId));
    });
  });
});
