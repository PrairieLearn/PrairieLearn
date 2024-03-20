const express = require('express');
const router = express.Router();
const _ = require('lodash');

const { logger } = require('@prairielearn/logger');
const { generateSignedToken, getCheckedSignedTokenData } = require('@prairielearn/signed-token');
const { config } = require('../lib/config');
const { idsEqual } = require('../lib/id');

var timeout = 24; // hours

router.all('/', function (req, res, next) {
  // SEB: check user-agent
  if ('user-agent' in req.headers) {
    checkUserAgent(res, req.headers['user-agent']);
  }

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

  // SafeExamBrowser protect the assesment
  if ('authz_result' in res.locals && res.locals.authz_result.mode === 'SEB') {
    // If the assessment is complete, use this middleware to show the logout page
    if ('assessment_instance' in res.locals && res.locals.assessment_instance.open === false) {
      return badSEB(req, res);
    }

    // If any of our auth checks didn't pass, fail (send to download)
    if (res.locals.authz_data.mode !== 'SEB') {
      return badSEB(req, res);
    }
  }

  // Password protect the assessment. Note that this only handles the general
  // case of an existing assessment instance. This middleware can't handle
  // the intricacies of creating a new assessment instance. We handle those
  // cases on the `studentAssessment` page.
  if (res.locals?.assessment_instance?.open && !module.exports.checkPasswordOrRedirect(req, res)) {
    return;
  }

  // Pass-through for everything else
  next();
});

module.exports = router;

/**
 * Checks if the given request has the correct password. If not, redirects to
 * a password input page.
 *
 * Returns `true` if the password is correct, `false` otherwise. If this
 * function returns `false`, the caller should not continue with the request.
 *
 * @returns {boolean}
 */
module.exports.checkPasswordOrRedirect = function (req, res) {
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
};

function badPassword(res, req) {
  logger.verbose(`invalid password attempt for ${res.locals.user.uid}`);
  res.cookie('pl_pw_origUrl', req.originalUrl);
  res.redirect('/pl/password');
}

function badSEB(req, res) {
  var SEBdata = {
    user_id: res.locals.user.user_id,
    assessment_id: res.locals.assessment.id,
    course_instance_id: res.locals.course_instance.id,
    authz_data: res.locals.authz_data,
  };
  res.locals.SEBdata = generateSignedToken(SEBdata, config.secretKey);
  //var proto = 'seb://';
  //var proto = 'http://';  // For testing
  //res.locals.SEBUrl = proto + req.get('host') + '/pl/downloadSEBConfig/';
  res.locals.SEBUrl = config.SEBDownloadUrl;
  res.locals.prompt = 'SEB';
  return res.status(403).render(__filename.replace(/\.js$/, '.ejs'), res.locals);
}

function checkUserAgent(res, userAgent) {
  // Check the useragent has SEB in it
  if (!userAgent.includes('SEB/2')) return;

  // Check user-agent header for exam string
  var examHash = userAgent.match(/prairielearn:(.+)$/);
  if (examHash === null) return;
  var key = examHash[1];

  var fromSEB = getCheckedSignedTokenData(key, config.secretKey, {
    maxAge: timeout * 60 * 60 * 1000,
  });

  if ('assessment' in res.locals) {
    if (
      idsEqual(fromSEB.assessment_id, res.locals.assessment.id) &&
      idsEqual(fromSEB.user_id, res.locals.authz_data.user.user_id)
    ) {
      res.locals.authz_data.mode = 'SEB';
    }
  } else {
    // Assessment list view, enable the mode
    res.locals.authz_data.mode = 'SEB';
  }
}

function closedAssessmentNotActive(res) {
  res.locals.prompt = 'closedAssessmentNotActive';
  res.status(403).render(__filename.replace(/\.js$/, '.ejs'), res.locals);
}

function closedAssessmentNotActiveHiddenGrade(res) {
  res.locals.prompt = 'closedAssessmentNotActiveHiddenGrade';
  res.status(403).render(__filename.replace(/\.js$/, '.ejs'), res.locals);
}

function assessmentNotStartedNotActive(res) {
  res.locals.prompt = 'assessmentNotStartedNotActive';
  res.status(403).render(__filename.replace(/\.js$/, '.ejs'), res.locals);
}
