import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import { Redis } from 'ioredis';
import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';
import { logger } from '@prairielearn/logger';
import { run } from '@prairielearn/run';
import { assertNever } from '@prairielearn/utils';

import { signPrairieTestJwt } from '../../ee/auth/prairieTestJwt.js';
import { config } from '../../lib/config.js';
import { RedisRateLimiter } from '../../lib/redis-rate-limiter.js';

const PT_CHEATING_REPORT_TIMEOUT_MS = 10_000;
const MAX_REPORT_LENGTH = 10_000;
const MAX_REPORTS_PER_HOUR = 5;

const defaultRateLimiter = new RedisRateLimiter({
  redis: () => {
    if (!config.nonVolatileRedisUrl) {
      throw new Error('nonVolatileRedisUrl must be set in config');
    }
    const redis = new Redis(config.nonVolatileRedisUrl);
    redis.on('error', (err) => logger.error('Cheating report Redis error', { err }));
    return redis;
  },
  keyPrefix: () => `${config.cacheKeyPrefix}cheating-report:`,
  intervalSeconds: 60 * 60,
});

export function createReportCheatingRouter({
  ptFetch = fetch,
  rateLimiter = defaultRateLimiter,
}: {
  ptFetch?: typeof fetch;
  rateLimiter?: Pick<RedisRateLimiter, 'addToIntervalUsage'>;
} = {}) {
  const router = Router();

  router.post(
    '/',
    asyncHandler(async (req, res) => {
      if (!res.locals.authn_user) {
        throw new HttpStatusError(403, 'Not authenticated');
      }
      const user_id = String(res.locals.authn_user.id);

      const report = typeof req.body.report === 'string' ? req.body.report.trim() : '';
      if (report.length === 0) {
        throw new HttpStatusError(400, 'Your report was empty, so nothing was submitted.');
      }
      if (report.length > MAX_REPORT_LENGTH) {
        throw new HttpStatusError(400, `Reports are limited to ${MAX_REPORT_LENGTH} characters.`);
      }

      const submissionIdResult = z.uuid().safeParse(req.body.submission_id);
      if (!submissionIdResult.success) {
        throw new HttpStatusError(
          400,
          'Your report could not be submitted. Please reload the page and try again.',
        );
      }

      const reservation_id: string | null = res.locals.cheating_report_reservation_id;
      if (!reservation_id) {
        throw new HttpStatusError(403, 'Cheating reports are not available for you right now.');
      }

      const reportCount = await rateLimiter.addToIntervalUsage(`${user_id}:${reservation_id}`, 1);
      if (reportCount > MAX_REPORTS_PER_HOUR) {
        throw new HttpStatusError(
          429,
          'You have submitted too many reports. Please tell your proctor directly.',
        );
      }

      const jwt = await signPrairieTestJwt({
        purpose: 'cheating_report',
        user_id,
        reservation_id,
        report,
        submission_id: submissionIdResult.data,
      });

      const outcome = await run(async (): Promise<'ok' | 'declined' | 'failed'> => {
        try {
          const ptResponse = await ptFetch(
            new URL('/pt/cheating-report', config.ptHost).toString(),
            {
              method: 'POST',
              body: new URLSearchParams({ jwt }),
              redirect: 'error',
              signal: AbortSignal.timeout(PT_CHEATING_REPORT_TIMEOUT_MS),
            },
          );
          if (ptResponse.status === 200) return 'ok';
          logger.error('PrairieTest cheating-report call returned non-ok', {
            status: ptResponse.status,
            statusText: ptResponse.statusText,
            user_id,
            reservation_id,
          });
          // PrairieTest uses 403 when reports are disabled.
          return ptResponse.status === 403 ? 'declined' : 'failed';
        } catch (err) {
          logger.error('PrairieTest cheating-report call threw', { err, user_id, reservation_id });
          return 'failed';
        }
      });

      switch (outcome) {
        case 'ok':
          res.json({ message: 'Your report has been submitted.' });
          return;
        case 'declined':
          throw new HttpStatusError(403, 'Cheating reports are not available for your exam.');
        case 'failed':
          throw new HttpStatusError(
            502,
            'We could not confirm whether your report was submitted. Please try again, or tell your proctor directly.',
          );
        default:
          assertNever(outcome);
      }
    }),
  );

  return router;
}

export default createReportCheatingRouter();
