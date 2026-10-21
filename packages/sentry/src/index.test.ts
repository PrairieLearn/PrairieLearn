import { createServer } from 'node:http';
import { setTimeout } from 'node:timers/promises';

import type { Envelope } from '@sentry/core';
import { afterAll, assert, beforeAll, it } from 'vitest';

import * as opentelemetry from '@prairielearn/opentelemetry';

import * as Sentry from './index.js';

const envelopes: Envelope[] = [];

beforeAll(async () => {
  await opentelemetry.init({
    openTelemetryEnabled: true,
    openTelemetrySamplerType: 'always-on',
  });
  await Sentry.init({
    dsn: 'https://public@example.com/1',
    release: 'test',
    transport: () => ({
      send: async (envelope) => {
        envelopes.push(envelope);
        return {};
      },
      flush: async () => true,
    }),
  });
});

afterAll(async () => {
  await Sentry.close();
  await opentelemetry.shutdown();
  opentelemetry.disableInstrumentations();
  opentelemetry.context.disable();
  opentelemetry.trace.disable();
});

it('isolates concurrent requests and links manually captured errors to OTel spans', async () => {
  const traceContexts = new Map<string, { traceId: string; spanId: string }>();
  const server = createServer((req, res) => {
    Sentry.requestHandler()(req, res, () => {
      Sentry.setTag('request', req.url);
      traceContexts.set(req.url!, opentelemetry.trace.getActiveSpan()!.spanContext());
      void setTimeout(req.url === '/first' ? 20 : 1).then(() => {
        Sentry.expressErrorHandler()(new Error(req.url), req, res, () => {
          res.end();
        });
      });
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address() as { port: number };
  try {
    await Promise.all(
      ['/first', '/second'].map(async (path) => {
        const response = await fetch(`http://127.0.0.1:${address.port}${path}`);
        await response.text();
      }),
    );
    await Sentry.flush();

    const events = envelopes.flatMap(([, items]) =>
      items.filter(([header]) => header.type === 'event').map(([, event]) => event as Sentry.Event),
    );
    assert.lengthOf(events, 2);
    for (const event of events) {
      const path = event.exception!.values![0].value!;
      assert.equal(event.tags!.request, path);
      assert.equal(event.transaction, `GET ${path}`);
      assert.equal(new URL(event.request!.url!).pathname, path);
      assert.equal(event.contexts!.trace!.trace_id, traceContexts.get(path)!.traceId);
      assert.equal(event.contexts!.trace!.span_id, traceContexts.get(path)!.spanId);
    }
    assert.notEqual(events[0].contexts!.trace!.trace_id, events[1].contexts!.trace!.trace_id);
    assert.isFalse(
      envelopes.some(([, items]) =>
        items.some(([header]) => ['transaction', 'span'].includes(header.type)),
      ),
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

it('redacts credentials from outgoing request events without changing the request body', async () => {
  const secret = 'test-secret-that-must-not-leak';
  const body = {
    '0': {
      json: {
        base_url: 'https://provider.example.com',
        secret_key: secret,
        credentials: [{ apiKey: secret, password: secret, access_token: secret }],
      },
    },
  };
  const originalBody = structuredClone(body);
  const req = {
    method: 'POST',
    url: '/trpc/aiGradingProviders.save',
    headers: { host: 'localhost' },
    body,
  };
  const eventId = await new Promise<string>((resolve) => {
    Sentry.requestHandler()(req, {}, () => {
      resolve(Sentry.captureException(new Error('Unexpected save failure')));
    });
  });
  await Sentry.flush();

  const events = envelopes.flatMap(([, items]) =>
    items.filter(([header]) => header.type === 'event').map(([, event]) => event as Sentry.Event),
  );
  const event = events.find((event) => event.event_id === eventId)!;
  assert.isDefined(event);
  assert.notInclude(JSON.stringify(event), secret);
  assert.deepEqual(event.request!.data, {
    '0': {
      json: {
        base_url: 'https://provider.example.com',
        secret_key: '[REDACTED]',
        credentials: [{ apiKey: '[REDACTED]', password: '[REDACTED]', access_token: '[REDACTED]' }],
      },
    },
  });
  assert.deepEqual(body, originalBody);
});

it('omits request data when credential redaction fails', async () => {
  const secret = 'test-secret-in-deep-request';
  const body = JSON.parse(
    '{"secret_key":"' +
      secret +
      '","nested":' +
      '{"nested":'.repeat(6000) +
      'null' +
      '}'.repeat(6000) +
      '}',
  );
  let eventId: string;
  Sentry.requestHandler()(
    { method: 'POST', url: '/trpc/aiGradingProviders.save', headers: { host: 'localhost' }, body },
    {},
    () => {
      eventId = Sentry.captureException(new Error('Failed save with deeply nested input'));
    },
  );
  await Sentry.flush();

  const events = envelopes.flatMap(([, items]) =>
    items.filter(([header]) => header.type === 'event').map(([, event]) => event as Sentry.Event),
  );
  const event = events.find((event) => event.event_id === eventId)!;
  assert.isDefined(event);
  assert.notInclude(JSON.stringify(event), secret);
  assert.isUndefined(event.request);
  assert.equal(event.exception!.values![0].value, 'Failed save with deeply nested input');
});
