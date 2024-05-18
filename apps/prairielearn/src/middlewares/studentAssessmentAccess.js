// @ts-check
import { Router } from 'express';
import _ from 'lodash';

import { logger } from '@prairielearn/logger';
import { getCheckedSignedTokenData } from '@prairielearn/signed-token';

import { config } from '../lib/config.js';
import { setCookie } from '../lib/cookie.js';

const router = Router();

var timeout = 24; // hours

router.all('/', function (req, res, next) {
  if (
    typeof res.locals.assessment_instance === 'undefined' &&
    !_.get(res.locals, 'authz_result.active', true)
  ) {
    // Student did not start the assessment, and the assessment is not active
    assessmentNotStartedNotActive(res);
    return;
  }

  if (
    !_.get(res.locals, 'authz_result.show_closed_assessment', true) &&
    (!_.get(res.locals, 'assessment_instance.open', true) ||
      !_.get(res.locals, 'authz_result.active', true))
  ) {
    // This assessment instance is closed and can no longer be viewed
    if (!_.get(res.locals, 'authz_result.show_closed_assessment_score', true)) {
      closedAssessmentNotActiveHiddenGrade(res);
    } else {
      closedAssessmentNotActive(res);
    }
    return;
  }

  // Password protect the assessment. Note that this only handles the general
  // case of an existing assessment instance. This middleware can't handle
  // the intricacies of creating a new assessment instance. We handle those
  // cases on the `studentAssessment` page.
  if (res.locals?.assessment_instance?.open && !checkPasswordOrRedirect(req, res)) {
    return;
  }

  // Pass-through for everything else
  next();
});

export default router;

/**
 * Checks if the given request has the correct password. If not, redirects to
 * a password input page.
 *
 * Returns `true` if the password is correct, `false` otherwise. If this
 * function returns `false`, the caller should not continue with the request.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {boolean}
 */
export function checkPasswordOrRedirect(req, res) {
  if (!res.locals.authz_result?.password) {
    // No password is required.
    return true;
  }

  if (req.cookies.pl_assessmentpw == null) {
    // The user has not entered a password yet.
    badPassword(res, req);
    return false;
  }

  var pwData = getCheckedSignedTokenData(req.cookies.pl_assessmentpw, config.secretKey, {
    maxAge: timeout * 60 * 60 * 1000,
  });
  if (pwData == null || pwData.password !== res.locals.authz_result.password) {
    // The password is incorrect or the cookie is expired.
    badPassword(res, req);
    return false;
  }

  // The password is correct and not expired!
  return true;
}

function badPassword(res, req) {
  logger.verbose(`invalid password attempt for ${res.locals.user.uid}`);
  setCookie(res, ['pl_pw_origUrl', 'pl2_pw_original_url'], req.originalUrl);
  res.redirect('/pl/password');
}

function closedAssessmentNotActive(res) {
  res.locals.prompt = 'closedAssessmentNotActive';
  res.status(403).render(import.meta.filename.replace(/\.js$/, '.ejs'), res.locals);
}

function closedAssessmentNotActiveHiddenGrade(res) {
  res.locals.prompt = 'closedAssessmentNotActiveHiddenGrade';
  res.status(403).render(import.meta.filename.replace(/\.js$/, '.ejs'), res.locals);
}

function assessmentNotStartedNotActive(res) {
  res.locals.prompt = 'assessmentNotStartedNotActive';
  res.status(403).render(import.meta.filename.replace(/\.js$/, '.ejs'), res.locals);
}
