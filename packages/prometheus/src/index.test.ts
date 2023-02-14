import { assert } from 'chai';
import express from 'express';
import http from 'node:http';
import net from 'node:net';
import fetch from 'node-fetch';

import { handler, register, Counter } from '.';

interface WithExpressServerCallbackOptions {
  app: express.Application;
  server: http.Server;
  port: number;
}

type WithExpressServerCallback = (options: WithExpressServerCallbackOptions) => Promise<void>;

async function withExpressServer(fn: WithExpressServerCallback) {
  const app = express();
  const server = app.listen(0);
  const port = (server.address() as net.AddressInfo).port;
  await new Promise((resolve) => server.on('listening', resolve));
  try {
    await fn({ app, server, port });
  } finally {
    server.close();
  }
}

describe('handler', () => {
  beforeEach(() => register.clear());

  it('fetches metrics', async () => {
    await withExpressServer(async ({ app, port }) => {
      app.use('/metrics', handler());

      const counter = new Counter({
        name: 'test_counter',
        help: 'test_counter_help',
      });
      counter.inc();

      const res = await fetch(`http://localhost:${port}/metrics`);
      assert.equal(res.status, 200);

      const text = await res.text();
      assert.match(text, /test_counter 1/);
      assert.match(text, /# HELP test_counter test_counter_help/);
      assert.match(text, /# TYPE test_counter counter/);
    });
  });
});
