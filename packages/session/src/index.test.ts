import express from 'express';
import { assert } from 'chai';
import { Server } from 'node:http';
import fetch from 'node-fetch';

import { createSessionMiddleware } from './index';

describe('session middleware', () => {
  it('sets a session cookie', async () => {
    const app = express();
    app.use(createSessionMiddleware());
    app.get('/', (_req, res) => res.send('Hello, world!'));

    await withServer(app, async (server) => {
      const port = getServerPort(server);
      const res = await fetch(`http://localhost:${port}/`);
      assert.equal(res.status, 200);
      assert.equal(await res.text(), 'Hello, world!');
    });
  });
});

async function withServer(app: express.Express, fn: (server: Server) => Promise<void>) {
  const server = app.listen();

  await new Promise<void>((resolve, reject) => {
    server.on('listening', () => resolve());
    server.on('error', (err) => reject(err));
  });

  try {
    await fn(server);
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
