// @ts-check
import asyncHandler from 'express-async-handler';

import { logger } from '@prairielearn/logger';
import * as sqldb from '@prairielearn/postgres';
import * as Sentry from '@prairielearn/sentry';

const sql = sqldb.loadSqlEquiv(import.meta.url);

/**
 * @param {string} pageType
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function logPageView(pageType, req, res) {
  const user_id = res.locals.user ? res.locals.user.user_id : res.locals.authn_user.user_id;

  // Originally, we opted to only record page views for assessments if
  // the authn'ed user is also the owner of the assessment instance.
  // However, we now track all page views, so be sure to filter by
  // authn_user_id if you only want page views from the student taking
  // the assessment.

  const params = {
    authn_user_id: res.locals.authn_user.user_id,
    user_id,
    course_instance_id: res.locals.course_instance ? res.locals.course_instance.id : null,
    assessment_id: res.locals.assessment ? res.locals.assessment.id : null,
    assessment_instance_id: res.locals.assessment_instance
      ? res.locals.assessment_instance.id
      : null,
    question_id: res.locals.question ? res.locals.question.id : null,
    variant_id: res.locals.variant ? res.locals.variant.id : null,
    page_type: pageType,
    path: req.originalUrl,
    client_fingerprint_id: res.locals.client_fingerprint_id ?? null,
  };

  await sqldb.queryOneRowAsync(sql.log_page_view, params).catch((err) => {
    // Swallow the error so that we don't affect the request, but still
    // report the error to Sentry.
    logger.error('error logging page view', err);
    Sentry.captureException(err);
  });
}

export default function (pageType) {
  return asyncHandler(async (req, res, next) => {
    if (req.method !== 'GET' || !res.locals.user || !res.locals.authn_user) {
      next();
      return;
    }

    await logPageView(pageType, req, res);

    next();
  });
}
