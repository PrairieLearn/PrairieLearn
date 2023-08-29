import express from 'express';
import { assert } from 'chai';
import { Server } from 'node:http';
import fetch from 'node-fetch';

import { createSessionMiddleware } from './index';

describe('session middleware', () => {
  it('sets a session cookie', async () => {
    const app = express();
    app.use(createSessionMiddleware());
    app.get('/', (_req, res) => res.sendStatus(200));

    await withServer(app, async ({ url }) => {
      const res = await fetch(url);
      assert.equal(res.status, 200);

      const header = res.headers.get('set-cookie');
      assert.equal(header, 'session=test; Path=/');
    });
  });

  it('sets a session cookie with a custom name', async () => {
    const app = express();
    app.use(
      createSessionMiddleware({
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
      assert.equal(header, 'prairielearn_session=test; Path=/');
    });
  });

  it('sets a secure cookie', async () => {
    const app = express();
    app.use(
      createSessionMiddleware({
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
      assert.equal(header, 'session=test; Path=/; Secure');
    });
  });

  it('sets a secure cookie for proxied HTTPS request', async () => {
    const app = express();
    app.enable('trust proxy');
    app.use(
      createSessionMiddleware({
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
      assert.equal(header, 'session=test; Path=/; Secure');
    });
  });

  it('sets a non-secure cookie for proxied HTTP request', async () => {
    const app = express();
    app.enable('trust proxy');
    app.use(
      createSessionMiddleware({
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
      assert.equal(header, 'session=test; Path=/');
    });
  });

  it('sets a secure cookie based on a custom function', async () => {
    const app = express();
    app.use(
      createSessionMiddleware({
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
      assert.equal(header, 'session=test; Path=/; Secure');
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
