import { type Request, type Response, Router } from 'express';
import asyncHandler from 'express-async-handler';
import { Redis } from 'ioredis';
import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';
import { flash } from '@prairielearn/flash';
import { logger } from '@prairielearn/logger';
import { run } from '@prairielearn/run';

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

function respondToReportSubmission({
  req,
  res,
  redirectUrl,
  type,
  message,
  status,
}: {
  req: Request;
  res: Response;
  redirectUrl: string;
  type: 'error' | 'success';
  message: string;
  status: number;
}) {
  if (req.accepts(['html', 'json']) === 'json') {
    res.status(status).json({ type, message });
    return;
  }
  flash(type, message);
  res.redirect(303, redirectUrl);
}

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
      // Ignore the referrer's origin to prevent open redirects.
      const redirectUrl = run(() => {
        const referrer = req.get('Referrer');
        const parsed = referrer ? URL.parse(referrer) : null;
        return parsed ? parsed.pathname + parsed.search : '/pl';
      });

      const report = typeof req.body.report === 'string' ? req.body.report.trim() : '';
      if (report.length === 0) {
        respondToReportSubmission({
          req,
          res,
          redirectUrl,
          type: 'error',
          message: 'Your report was empty, so nothing was submitted.',
          status: 400,
        });
        return;
      }
      if (report.length > MAX_REPORT_LENGTH) {
        respondToReportSubmission({
          req,
          res,
          redirectUrl,
          type: 'error',
          message: `Reports are limited to ${MAX_REPORT_LENGTH} characters.`,
          status: 400,
        });
        return;
      }

      const submissionIdResult = z.uuid().safeParse(req.body.submission_id);
      if (!submissionIdResult.success) {
        respondToReportSubmission({
          req,
          res,
          redirectUrl,
          type: 'error',
          message: 'Your report could not be submitted. Please reload the page and try again.',
          status: 400,
        });
        return;
      }

      const reservation_id: string | null = res.locals.cheating_report_reservation_id;
      if (!reservation_id) {
        respondToReportSubmission({
          req,
          res,
          redirectUrl,
          type: 'error',
          message: 'Cheating reports are not available for you right now.',
          status: 403,
        });
        return;
      }

      const reportCount = await rateLimiter.addToIntervalUsage(`${user_id}:${reservation_id}`, 1);
      if (reportCount > MAX_REPORTS_PER_HOUR) {
        respondToReportSubmission({
          req,
          res,
          redirectUrl,
          type: 'error',
          message: 'You have submitted too many reports. Please tell your proctor directly.',
          status: 429,
        });
        return;
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

      const response =
        outcome === 'ok'
          ? { type: 'success' as const, message: 'Your report has been submitted.', status: 200 }
          : outcome === 'declined'
            ? {
                type: 'error' as const,
                message: 'Cheating reports are not available for your exam.',
                status: 403,
              }
            : {
                type: 'error' as const,
                message:
                  'We could not confirm whether your report was submitted. Please try again, or tell your proctor directly.',
                status: 502,
              };
      respondToReportSubmission({ req, res, redirectUrl, ...response });
    }),
  );

  return router;
}

export default createReportCheatingRouter();
