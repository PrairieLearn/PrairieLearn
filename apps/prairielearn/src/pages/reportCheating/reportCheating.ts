import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import { Redis } from 'ioredis';

import { HttpStatusError } from '@prairielearn/error';
import { flash } from '@prairielearn/flash';
import { logger } from '@prairielearn/logger';
import { run } from '@prairielearn/run';

import { signPrairieTestJwt } from '../../ee/auth/prairieTestJwt.js';
import { config } from '../../lib/config.js';
import { RedisRateLimiter } from '../../lib/redis-rate-limiter.js';

const router = Router();

const PT_CHEATING_REPORT_TIMEOUT_MS = 10_000;
const MAX_REPORT_LENGTH = 10_000;
const MAX_REPORTS_PER_HOUR = 5;

const rateLimiter = new RedisRateLimiter({
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

/**
 * Receives the navbar "Report cheating" modal submission, mints a short-lived
 * JWT carrying the report text, and calls PT server-to-server to file it.
 *
 * The reporting reservation is `res.locals.cheating_report_reservation_id`,
 * which `enforceLockdownBrowser` recomputes on this request (the id of an
 * active in-access-window reservation whose owning center/course has opted in,
 * or null). PL only shows the control for opted-in exams, but PrairieTest
 * re-checks the opt-in authoritatively and can still decline (e.g. if the flag
 * was toggled off after the page loaded). PT stores the report and notifies
 * proctors; PL keeps no report history of its own. The outcome surfaces as a
 * flash message on the page the student came from.
 */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (!res.locals.authn_user) {
      throw new HttpStatusError(403, 'Not authenticated');
    }
    const user_id = String(res.locals.authn_user.id);
    // Redirect back to the page the report was filed from. We keep only the
    // Referer's path so the redirect stays on our own origin, avoiding an open
    // redirect (cf. pages/jobSequence).
    const redirectUrl = run(() => {
      const referrer = req.get('Referrer');
      const parsed = referrer ? URL.parse(referrer) : null;
      return parsed ? parsed.pathname + parsed.search : '/pl';
    });

    const report = typeof req.body.report === 'string' ? req.body.report.trim() : '';
    if (report.length === 0) {
      flash('error', 'Your report was empty, so nothing was submitted.');
      res.redirect(redirectUrl);
      return;
    }
    if (report.length > MAX_REPORT_LENGTH) {
      flash('error', `Reports are limited to ${MAX_REPORT_LENGTH} characters.`);
      res.redirect(redirectUrl);
      return;
    }

    const reservation_id: string | null = res.locals.cheating_report_reservation_id;
    if (!reservation_id) {
      flash('error', 'Cheating reports are not available for you right now.');
      res.redirect(redirectUrl);
      return;
    }

    const reportCount = await rateLimiter.addToIntervalUsage(`${user_id}:${reservation_id}`, 1);
    if (reportCount > MAX_REPORTS_PER_HOUR) {
      flash('error', 'You have submitted too many reports. Please tell your proctor directly.');
      res.redirect(redirectUrl);
      return;
    }

    const jwt = await signPrairieTestJwt({ user_id, reservation_id, report });

    // 'ok' → filed; 'declined' → PT rejected it (most often the center/course
    // hasn't enabled reports, since we show the button for any active exam);
    // 'failed' → PT unreachable or errored, so it's worth retrying.
    const outcome = await run(async (): Promise<'ok' | 'declined' | 'failed'> => {
      try {
        const ptResponse = await fetch(new URL('/pt/cheating-report', config.ptHost).toString(), {
          method: 'POST',
          body: new URLSearchParams({ jwt }),
          signal: AbortSignal.timeout(PT_CHEATING_REPORT_TIMEOUT_MS),
        });
        if (ptResponse.ok) return 'ok';
        // 403 is expected when the center/course hasn't opted in, but PT also
        // uses it for auth failures (e.g. a mismatched shared secret), so log
        // it to keep a misconfiguration distinguishable from a normal decline.
        logger.error('PrairieTest cheating-report call returned non-ok', {
          status: ptResponse.status,
          statusText: ptResponse.statusText,
          user_id,
          reservation_id,
        });
        return ptResponse.status === 403 ? 'declined' : 'failed';
      } catch (err) {
        logger.error('PrairieTest cheating-report call threw', { err, user_id, reservation_id });
        return 'failed';
      }
    });

    if (outcome === 'ok') {
      flash('success', 'Your report has been submitted.');
    } else if (outcome === 'declined') {
      flash('error', 'Cheating reports are not available for your exam.');
    } else {
      flash(
        'error',
        'We could not submit your report. Please try again, or tell your proctor directly.',
      );
    }
    res.redirect(redirectUrl);
  }),
);

export default router;
