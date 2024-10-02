// @ts-check
import { logger } from '@prairielearn/logger';

import { canonicalLogger } from '../lib/canonical-logger.js';

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export default function (req, res, next) {
  // Capture the path at the start of the request; it may have been rewritten
  // by the time the finish handler executes.
  const path = req.path;

  const start = performance.now();

  if (req.method !== 'OPTIONS') {
    res.once('close', function () {
      logger.verbose('response', {
        ...canonicalLogger.data(),
        duration: performance.now() - start,
        response_id: res.locals.response_id,
        ip: req.ip,
        forwardedIP: req.headers['x-forwarded-for'],
        method: req.method,
        path,
        params: req.params,
        body: req.body,
        finished: res.writableFinished,
        authn_user_id: res.locals?.authn_user?.user_id ?? null,
        authn_user_uid: res.locals?.authn_user?.uid ?? null,
        user_id: res.locals?.user?.user_id ?? null,
        user_uid: res.locals?.user?.uid ?? null,
        course_id: res.locals?.course?.id ?? null,
        course_short_name: res.locals?.course?.short_name ?? null,
        course_instance_id: res.locals?.course_instance?.id ?? null,
        course_instance_short_name: res.locals?.course_instance?.short_name ?? null,
        assessment_id: res.locals?.assessment?.id ?? null,
        assessment_directory: res.locals?.assessment?.tid ?? null,
        assessment_instance_id: res.locals?.assessment_instance?.id ?? null,
        question_id: res.locals?.question?.id ?? null,
        question_directory: res.locals?.question?.directory ?? null,
        instance_question_id: res.locals?.instance_question?.id ?? null,
      });

      // Print additional message in this case to simplify grepping logs for this scenario
      if (!res.writableFinished) {
        logger.verbose('request aborted by client', {
          response_id: res.locals.response_id,
        });
      }
    });
  }
  next();
}
