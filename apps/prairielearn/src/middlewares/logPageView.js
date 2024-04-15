// @ts-check
const ERR = require('async-stacktrace');

const { logger } = require('@prairielearn/logger');
const sqldb = require('@prairielearn/postgres');

const sql = sqldb.loadSqlEquiv(__filename);

module.exports = function (pageType) {
  /** @type {(req: import('express').Request, res: import('express').Response, next: (err?: Error | null) => void) => void} */
  return function (req, res, next) {
    if (req.method !== 'GET' || !res.locals.user || !res.locals.authn_user) {
      next();
      return;
    }

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

    sqldb.queryOneRow(sql.log_page_view, params, function (err, result) {
      if (ERR(err, (e) => logger.error('error logging page view', e))) return next();
      res.locals.page_view_id = result.rows[0].id;
      next();
    });
  };
};
