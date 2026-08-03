import * as crypto from 'node:crypto';

import express, { type ErrorRequestHandler, type Express } from 'express';
import * as jose from 'jose';
import { afterEach, assert, describe, it, vi } from 'vitest';

import type { HttpStatusError } from '@prairielearn/error';
import { withServer } from '@prairielearn/express-test-utils';

import { config } from '../../lib/config.js';

import { createReportCheatingRouter } from './reportCheating.js';

function createApp({
  ptFetch,
  reportCount = 1,
}: {
  ptFetch: typeof fetch;
  reportCount?: number;
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
      rateLimiter: { addToIntervalUsage: vi.fn(async () => reportCount) },
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
  return { report: 'Student nearby is using a phone.', submission_id: crypto.randomUUID() };
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
    assert.match(String(payload.submission_id), /^[0-9a-f-]{36}$/);
  });

  it('rejects invalid input before calling PrairieTest', async () => {
    const ptFetch = vi.fn<typeof fetch>();
    const { response } = await postReport(createApp({ ptFetch }), {
      report: '   ',
      submission_id: crypto.randomUUID(),
    });

    assert.equal(response.status, 400);
    assert.equal(ptFetch.mock.calls.length, 0);
  });

  it('enforces the report rate limit', async () => {
    const ptFetch = vi.fn<typeof fetch>();
    const { response, json } = await postReport(
      createApp({ ptFetch, reportCount: 6 }),
      validBody(),
    );

    assert.equal(response.status, 429);
    assert.equal(
      json.error,
      'You have submitted too many reports. Please tell your proctor directly.',
    );
    assert.equal(ptFetch.mock.calls.length, 0);
  });

  it('distinguishes declined and failed PrairieTest requests', async () => {
    const declinedFetch = vi.fn<typeof fetch>();
    declinedFetch.mockResolvedValue(new Response(null, { status: 403 }));
    const declined = await postReport(createApp({ ptFetch: declinedFetch }), validBody());
    assert.equal(declined.response.status, 403);
    assert.equal(declined.json.error, 'Cheating reports are not available for your exam.');

    const failedFetch = vi.fn<typeof fetch>();
    failedFetch.mockResolvedValue(new Response(null, { status: 302 }));
    const failed = await postReport(createApp({ ptFetch: failedFetch }), validBody());
    assert.equal(failed.response.status, 502);
    assert.equal(
      failed.json.error,
      'We could not confirm whether your report was submitted. Please try again, or tell your proctor directly.',
    );
  });
});
