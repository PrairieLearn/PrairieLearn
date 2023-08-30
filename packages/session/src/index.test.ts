import express from 'express';
import { assert } from 'chai';
import { Server } from 'node:http';
import fetch from 'node-fetch';
import fetchCookie from 'fetch-cookie';
import { parse as parseSetCookie } from 'set-cookie-parser';

import { createSessionMiddleware } from './index';
import { MemoryStore } from './memory-store';

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
      console.log('got response');

      const body = await res.text();
      assert.equal(body, 'test');
    });
  });
});

interface WithServerContext {
  server: Server;
  port: number;
  url: string;
}

async function withServer(app: express.Express, fn: (ctx: WithServerContext) => Promise<void>) {
  const server = app.listen();

  await new Promise<void>((resolve, reject) => {
    server.on('listening', () => resolve());
    server.on('error', (err) => reject(err));
  });

  try {
    await fn({
      server,
      port: getServerPort(server),
      url: `http://localhost:${getServerPort(server)}`,
    });
  } finally {
    server.close();
  }
}

function getServerPort(server: Server): number {
  const address = server.address();
  if (!address) throw new Error('Server is not listening');
  if (typeof address === 'string') throw new Error('Server is listening on a pipe');
  return address.port;
}
