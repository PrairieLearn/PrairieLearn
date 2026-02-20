import { type Request, type Response } from 'express';
import asyncHandler from 'express-async-handler';

import { HttpStatusError } from '@prairielearn/error';
import { flash } from '@prairielearn/flash';
import { logger } from '@prairielearn/logger';
import { getCheckedSignedTokenData } from '@prairielearn/signed-token';

import { deleteAssessmentInstance } from '../lib/assessment.js';
import { canDeleteAssessmentInstance } from '../lib/assessment.shared.js';
import { config } from '../lib/config.js';
import { setCookie } from '../lib/cookie.js';

import { StudentAssessmentAccess } from './studentAssessmentAccess.html.js';

export function checkStudentAssessmentAccess(req: Request, res: Response): boolean {
  const showClosedAssessment = res.locals.authz_result?.show_closed_assessment ?? true;
  const assessmentInstanceOpen = res.locals.assessment_instance?.open ?? true;
  const assessmentActive = res.locals.authz_result?.active ?? true;

  if (!showClosedAssessment && (!assessmentInstanceOpen || !assessmentActive)) {
    // We're here because we want to hide closed assessments and one of the following is true:
    //
    // - The assessment instance is closed
    // - There is no assessment instance, or the assessment is not active
    //
    // The first case is trivial.
    //
    // The second case isn't entirely obvious. One could assume that if the assessment instance
    // is open, even if the assessment is not active, the student should be able to access it.
    // However, this is not the case. If one is using `showClosedAssessment: false` with a date
    // range that *grants* access in a certain time frame, they need to pair that with another
    // access rule that will also apply `showClosedAssessment: false` outside of that time
    // frame to ensure that students still can't see it. They need to add `active: false` to
    // that same access rule to override the default, which would otherwise allow students to
    // start the assessment when that access rule applies, even though they'd have no credit.
    // We rely on completely blocking access when `active: false` and `showClosedAssessment: false`
    // are both used, as there's otherwise no way to totally block access.
    res.status(403).send(
      StudentAssessmentAccess({
        // @ts-expect-error The types on checkStudentAssessmentAccess aren't perfect
        resLocals: res.locals,
        showClosedScore: res.locals.authz_result?.show_closed_assessment_score ?? true,
        showTimeLimitExpiredModal: req.query.timeLimitExpired === 'true',
        userCanDeleteAssessmentInstance: canDeleteAssessmentInstance(res.locals),
      }),
    );
    return false;
  }

  // Password protect the assessment. Note that this only handles the general
  // case of an existing assessment instance. This middleware can't handle
  // the intricacies of creating a new assessment instance. We handle those
  // cases on the `studentAssessment` page.
  if (res.locals.assessment_instance?.open && !checkPasswordOrRedirect(req, res)) {
    return false;
  }

  return true;
}

export default asyncHandler(async (req, res, next) => {
  // This POST request is handled in the middleware instead of in the individual
  // pages because it may be received from the page served directly by the
  // middleware. Since the other pages where this action is possible are served
  // by the middleware as well, they are not needed there.
  if (req.method === 'POST' && req.body.__action === 'regenerate_instance') {
    if (!canDeleteAssessmentInstance(res.locals)) {
      throw new HttpStatusError(
        403,
        'You do not have permission to delete this assessment instance.',
      );
    }
    await deleteAssessmentInstance(
      res.locals.assessment.id,
      res.locals.assessment_instance.id,
      res.locals.authn_user.id,
    );

    flash('success', 'Your previous assessment instance was deleted.');
    res.redirect(`${res.locals.urlPrefix}/assessment/${res.locals.assessment.id}`);
    return;
  }

  const hasAccess = checkStudentAssessmentAccess(req, res);
  if (!hasAccess) {
    // We've already sent a response (either a 403, or a redirect to enter a password).
    return;
  }

  // Pass-through for everything else
  next();
});

/**
 * Checks if the given request has the correct password. If not, redirects to
 * a password input page.
 *
 * Returns `true` if the password is correct, `false` otherwise. If this
 * function returns `false`, the caller should not continue with the request.
 */
export function checkPasswordOrRedirect(req: Request, res: Response): boolean {
  if (!res.locals.authz_result?.password) {
    // No password is required.
    return true;
  }

  if (req.cookies.pl2_assessmentpw == null) {
    // The user has not entered a password yet.
    badPassword(req, res);
    return false;
  }

  const pwData = getCheckedSignedTokenData(req.cookies.pl2_assessmentpw, config.secretKey, {
    maxAge: 24 * 60 * 60 * 1000,
  });
  if (pwData == null || pwData.password !== res.locals.authz_result.password) {
    // The password is incorrect or the cookie is expired.
    badPassword(req, res);
    return false;
  }

  // The password is correct and not expired!
  return true;
}

function badPassword(req: Request, res: Response) {
  logger.verbose(`invalid password attempt for ${res.locals.user.uid}`);
  setCookie(res, ['pl_pw_origUrl', 'pl2_pw_original_url'], req.originalUrl);
  res.redirect('/pl/password');
}
