import * as crypto from 'node:crypto';

import express, { type ErrorRequestHandler, type Express } from 'express';
import { Redis } from 'ioredis';
import * as jose from 'jose';
import { afterEach, assert, describe, it, vi } from 'vitest';

import type { HttpStatusError } from '@prairielearn/error';
import { withServer } from '@prairielearn/express-test-utils';

import { config } from '../../lib/config.js';
import { RedisRateLimiter } from '../../lib/redis-rate-limiter.js';

import { createReportCheatingRouter } from './reportCheating.js';

function createApp({
  ptFetch,
  rateLimiter = { addToIntervalUsageOnce: async () => 1 },
}: {
  ptFetch: typeof fetch;
  rateLimiter?: Pick<RedisRateLimiter, 'addToIntervalUsageOnce'>;
}): Express {
  const app = express();
  app.use(express.json());
  app.use((_req, res, next) => {
    res.locals.authn_user = { id: '1' };
    res.locals.cheating_report_reservation_id = '2';
    next();
  });
  app.use(
    createReportCheatingRouter({
      ptFetch,
      rateLimiter,
    }),
  );
  app.use(((err, _req, res, _next) => {
    const httpError = err as HttpStatusError;
    res.status(httpError.status).json({ error: httpError.message });
  }) satisfies ErrorRequestHandler);
  return app;
}

async function postReport(
  app: Express,
  body: Record<string, string>,
): Promise<{ response: Response; json: { error?: string; message?: string } }> {
  let response!: Response;
  await withServer(app, async ({ url }) => {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  });
  return { response, json: await response.json() };
}

function validBody() {
  return { report: 'Student nearby is using a phone.', request_id: crypto.randomUUID() };
}

describe('POST /pl/report-cheating', () => {
  afterEach(() => vi.restoreAllMocks());

  it('signs and forwards a report', async () => {
    const ptFetch = vi.fn<typeof fetch>();
    ptFetch.mockResolvedValue(new Response(null, { status: 200 }));

    const { response, json } = await postReport(createApp({ ptFetch }), validBody());
    assert.equal(response.status, 200);
    assert.equal(json.message, 'Your report has been submitted.');

    const [, init] = ptFetch.mock.calls[0];
    assert.equal(init?.redirect, 'error');
    assert.instanceOf(init?.body, URLSearchParams);
    const jwt = init.body.get('jwt')!;
    assert.isString(jwt);

    const key = crypto.createSecretKey(config.prairieTestSharedAuthSecret, 'utf-8');
    const { payload } = await jose.jwtVerify(jwt, key, { audience: 'prairietest' });
    assert.deepInclude(payload, {
      purpose: 'cheating_report',
      user_id: '1',
      reservation_id: '2',
      report: 'Student nearby is using a phone.',
    });
    assert.match(String(payload.request_id), /^[0-9a-f-]{36}$/);
  });

  it('rejects invalid input before calling PrairieTest', async () => {
    const ptFetch = vi.fn<typeof fetch>();
    const { response } = await postReport(createApp({ ptFetch }), {
      report: '   ',
      request_id: crypto.randomUUID(),
    });

    assert.equal(response.status, 400);
    assert.equal(ptFetch.mock.calls.length, 0);
  });

  it('rate-limits distinct requests without charging retries', async () => {
    const redisUrl = config.nonVolatileRedisUrl;
    assert(redisUrl);
    const redis = new Redis(redisUrl);
    const keyPrefix = `${config.cacheKeyPrefix}test:report-cheating:${crypto.randomUUID()}:`;
    const rateLimiter = new RedisRateLimiter({
      redis: () => redis,
      keyPrefix: () => keyPrefix,
      intervalSeconds: 60 * 60,
    });
    const ptFetch = vi.fn(async () => new Response(null, { status: 200 }));
    const app = createApp({ ptFetch, rateLimiter });
    const firstRequest = validBody();

    try {
      assert.equal((await postReport(app, firstRequest)).response.status, 200);
      assert.equal((await postReport(app, firstRequest)).response.status, 200);

      for (let i = 0; i < 4; i++) {
        assert.equal((await postReport(app, validBody())).response.status, 200);
      }

      const rejectedRequest = validBody();
      const rejected = await postReport(app, rejectedRequest);
      assert.equal(rejected.response.status, 429);
      assert.equal(
        rejected.json.error,
        'You have submitted too many reports. Please tell your proctor directly.',
      );
      assert.equal(ptFetch.mock.calls.length, 6);

      assert.equal((await postReport(app, firstRequest)).response.status, 200);
      assert.equal((await postReport(app, rejectedRequest)).response.status, 429);
      assert.equal(ptFetch.mock.calls.length, 7);
    } finally {
      const keys = await redis.keys(`${keyPrefix}*`);
      if (keys.length > 0) await redis.del(keys[0], ...keys.slice(1));
      await rateLimiter.close();
    }
  });

  it('distinguishes declined and failed PrairieTest requests', async () => {
    const declinedFetch = vi.fn<typeof fetch>();
    declinedFetch.mockResolvedValue(new Response(null, { status: 403 }));
    const declined = await postReport(createApp({ ptFetch: declinedFetch }), validBody());
    assert.equal(declined.response.status, 403);
    assert.equal(
      declined.json.error,
      'Cheating reports are no longer available. Please tell your proctor directly.',
    );

    const failedFetch = vi.fn<typeof fetch>();
    failedFetch.mockResolvedValue(new Response(null, { status: 302 }));
    const failed = await postReport(createApp({ ptFetch: failedFetch }), validBody());
    assert.equal(failed.response.status, 502);
    assert.equal(
      failed.json.error,
      'Something went wrong while submitting your report. Please try again, or tell your proctor directly.',
    );
  });
});
