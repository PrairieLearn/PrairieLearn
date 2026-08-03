import * as crypto from 'node:crypto';

import express, { type ErrorRequestHandler, type Express, type RequestHandler } from 'express';
import { Redis } from 'ioredis';
import * as jose from 'jose';
import { assert, describe, it } from 'vitest';

import type { HttpStatusError } from '@prairielearn/error';
import { withServer } from '@prairielearn/express-test-utils';

import { config } from '../../lib/config.js';
import { RedisRateLimiter } from '../../lib/redis-rate-limiter.js';
import { withConfig } from '../../tests/utils/config.js';

import { createReportCheatingRouter } from './reportCheating.js';

function createApp(
  rateLimiter: Pick<RedisRateLimiter, 'addToIntervalUsageOnce'> = {
    addToIntervalUsageOnce: async () => 1,
  },
): Express {
  const app = express();
  app.use(express.json());
  app.use((_req, res, next) => {
    res.locals.authn_user = { id: '1' };
    res.locals.cheating_report_reservation_id = '2';
    next();
  });
  app.use(createReportCheatingRouter({ rateLimiter }));
  app.use(((err, _req, res, _next) => {
    const httpError = err as HttpStatusError;
    res.status(httpError.status).json({ error: httpError.message });
  }) satisfies ErrorRequestHandler);
  return app;
}

function createPrairieTestApp(handler: RequestHandler): Express {
  const app = express();
  app.use(express.urlencoded({ extended: false }));
  app.post('/pt/cheating-report', handler);
  return app;
}

async function withTestServers(
  {
    prairieTestApp,
    rateLimiter,
  }: {
    prairieTestApp: Express;
    rateLimiter?: Pick<RedisRateLimiter, 'addToIntervalUsageOnce'>;
  },
  fn: (prairieLearnUrl: string) => Promise<void>,
) {
  await withServer(prairieTestApp, async ({ url: ptHost }) => {
    await withConfig({ ptHost }, async () => {
      await withServer(createApp(rateLimiter), async ({ url }) => {
        await fn(url);
      });
    });
  });
}

async function postReport(
  prairieLearnUrl: string,
  body: Record<string, string>,
): Promise<{ response: Response; json: { error?: string; message?: string } }> {
  const response = await fetch(prairieLearnUrl, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return { response, json: await response.json() };
}

function validBody() {
  return { report: 'Student nearby is using a phone.', request_id: crypto.randomUUID() };
}

describe('POST /pl/report-cheating', () => {
  it('signs and forwards a report', async () => {
    let jwt: string | undefined;
    const prairieTestApp = createPrairieTestApp((req, res) => {
      if (typeof req.body.jwt === 'string') jwt = req.body.jwt;
      res.sendStatus(200);
    });

    await withTestServers({ prairieTestApp }, async (prairieLearnUrl) => {
      const { response, json } = await postReport(prairieLearnUrl, validBody());
      assert.equal(response.status, 200);
      assert.equal(json.message, 'Your report has been submitted.');
    });

    assert(jwt);
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
    let requestCount = 0;
    const prairieTestApp = createPrairieTestApp((_req, res) => {
      requestCount++;
      res.sendStatus(200);
    });

    await withTestServers({ prairieTestApp }, async (prairieLearnUrl) => {
      const { response } = await postReport(prairieLearnUrl, {
        report: '   ',
        request_id: crypto.randomUUID(),
      });
      assert.equal(response.status, 400);
    });
    assert.equal(requestCount, 0);
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
    let prairieTestRequestCount = 0;
    const prairieTestApp = createPrairieTestApp((_req, res) => {
      prairieTestRequestCount++;
      res.sendStatus(200);
    });
    const firstRequest = validBody();

    try {
      await withTestServers({ prairieTestApp, rateLimiter }, async (prairieLearnUrl) => {
        assert.equal((await postReport(prairieLearnUrl, firstRequest)).response.status, 200);
        assert.equal((await postReport(prairieLearnUrl, firstRequest)).response.status, 200);

        for (let i = 0; i < 4; i++) {
          assert.equal((await postReport(prairieLearnUrl, validBody())).response.status, 200);
        }

        const rejectedRequest = validBody();
        const rejected = await postReport(prairieLearnUrl, rejectedRequest);
        assert.equal(rejected.response.status, 429);
        assert.equal(
          rejected.json.error,
          'You have submitted too many reports. Please tell your proctor directly.',
        );
        assert.equal(prairieTestRequestCount, 6);

        assert.equal((await postReport(prairieLearnUrl, firstRequest)).response.status, 200);
        assert.equal((await postReport(prairieLearnUrl, rejectedRequest)).response.status, 429);
        assert.equal(prairieTestRequestCount, 7);
      });
    } finally {
      const keys = await redis.keys(`${keyPrefix}*`);
      if (keys.length > 0) await redis.del(keys[0], ...keys.slice(1));
      await rateLimiter.close();
    }
  });

  it('handles declined, failed, and redirecting PrairieTest responses', async () => {
    let behavior: 'declined' | 'failed' | 'redirect' = 'declined';
    let redirectTargetCount = 0;
    const prairieTestApp = createPrairieTestApp((_req, res) => {
      switch (behavior) {
        case 'declined':
          res.sendStatus(403);
          return;
        case 'failed':
          res.sendStatus(500);
          return;
        case 'redirect':
          res.redirect('/pt/redirect-target');
      }
    });
    prairieTestApp.all('/pt/redirect-target', (_req, res) => {
      redirectTargetCount++;
      res.sendStatus(200);
    });

    await withTestServers({ prairieTestApp }, async (prairieLearnUrl) => {
      const declined = await postReport(prairieLearnUrl, validBody());
      assert.equal(declined.response.status, 403);
      assert.equal(
        declined.json.error,
        'Cheating reports are no longer available. Please tell your proctor directly.',
      );

      behavior = 'failed';
      const failed = await postReport(prairieLearnUrl, validBody());
      assert.equal(failed.response.status, 502);
      assert.equal(
        failed.json.error,
        'Something went wrong while submitting your report. Please try again, or tell your proctor directly.',
      );

      behavior = 'redirect';
      const redirected = await postReport(prairieLearnUrl, validBody());
      assert.equal(redirected.response.status, 502);
      assert.equal(
        redirected.json.error,
        'Something went wrong while submitting your report. Please try again, or tell your proctor directly.',
      );
      assert.equal(redirectTargetCount, 0);
    });
  });
});
