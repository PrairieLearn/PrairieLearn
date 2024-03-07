// @ts-check
const asyncHandler = require('express-async-handler');
const express = require('express');
const router = express.Router();
const _ = require('lodash');
const oauthSignature = require('oauth-signature');
const { cache } = require('@prairielearn/cache');

const sqldb = require('@prairielearn/postgres');
const sql = sqldb.loadSqlEquiv(__filename);
const error = require('@prairielearn/error');
const { generateSignedToken } = require('@prairielearn/signed-token');
const { config } = require('../../lib/config');
const { shouldSecureCookie } = require('../../lib/cookie');

const TIME_TOLERANCE_SEC = 3000;

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const parameters = _.clone(req.body);
    const signature = req.body.oauth_signature;
    delete parameters.oauth_signature;

    const ltiRedirectUrl = config.ltiRedirectUrl;
    if (!ltiRedirectUrl) {
      throw error.make(404, 'LTI not configured');
    }

    if (parameters.lti_message_type !== 'basic-lti-launch-request') {
      throw error.make(400, 'Unsupported lti_message_type');
    }

    if (parameters.lti_version !== 'LTI-1p0') {
      throw error.make(400, 'Unsupported lti_version');
    }

    if (!parameters.oauth_consumer_key) {
      throw error.make(400, 'Badly formed oauth_consumer_key');
    }

    if (!parameters.resource_link_id) {
      throw error.make(400, 'Badly formed resource_link_id');
    }

    // FIXME: could warn or throw an error if parameters.roles exists (no longer used)
    // FIXME: could add a parameter that allows setting course role or course instance role

    const result = await sqldb.queryZeroOrOneRowAsync(sql.lookup_credential, {
      consumer_key: parameters.oauth_consumer_key,
    });
    if (result.rowCount === 0) throw error.make(403, 'Unknown consumer_key');

    const ltiresult = result.rows[0];

    const genSignature = oauthSignature.generate(
      'POST',
      ltiRedirectUrl,
      parameters,
      ltiresult.secret,
      undefined,
      { encodeSignature: false },
    );
    if (genSignature !== signature) {
      throw error.make(403, 'Invalid signature');
    }

    // Check oauth_timestamp within N seconds of now (3000 suggested)
    const timeDiff = Math.abs(Math.floor(Date.now() / 1000) - parameters.oauth_timestamp);
    if (timeDiff > TIME_TOLERANCE_SEC) {
      throw error.make(403, 'Invalid timestamp');
    }

    // Check nonce hasn't been used by that consumer_key in that timeframe
    // https://oauth.net/core/1.0/#nonce
    const nonceKey = 'authCallbackLti:' + parameters.oauth_timestamp + ':' + parameters.oauth_nonce;
    const nonceVal = await cache.get(nonceKey);

    if (nonceVal) {
      throw error.make(403, 'Nonce reused');
    }

    // Remember that this nonce was already used.
    cache.set(nonceKey, true, TIME_TOLERANCE_SEC * 1000);

    // OAuth validation succeeded, next look up and store user authn data
    if (!parameters.user_id) {
      throw error.make(400, 'Authentication problem: UserID required. Anonymous access disabled.');
    }

    // Create unique UID from LTI parameters and CI id
    // Not using an email address (parameters.lis_person_contact_email_primary)
    // so that LTI doesn't conflict with other UIDs.
    const authUid =
      parameters.user_id + '@' + parameters.context_id + '::ciid=' + ltiresult.course_instance_id;

    let fallbackName = 'LTI user';
    if (parameters.context_title) {
      fallbackName = `${parameters.context_title} user`;
      // e.g. UIUC Degree Sandbox user
    }
    const authName = parameters.lis_person_name_full || fallbackName;

    const userResult = await sqldb.callAsync('users_select_or_insert_and_enroll_lti', [
      authUid,
      authName,
      ltiresult.course_instance_id,
      parameters.user_id,
      parameters.context_id,
      res.locals.req_date,
    ]);
    if (!userResult.rows[0].has_access) {
      throw error.make(403, 'Access denied');
    }

    const tokenData = {
      user_id: result.rows[0].user_id,
      authn_provider_name: 'LTI',
    };
    const pl_authn = generateSignedToken(tokenData, config.secretKey);
    res.cookie('pl_authn', pl_authn, {
      maxAge: config.authnCookieMaxAgeMilliseconds,
      httpOnly: true,
      secure: shouldSecureCookie(req),
    });

    // Dual-write information to the session so that we can start reading
    // it instead of the cookie in the future.
    req.session.user_id = userResult.rows[0].user_id;
    req.session.authn_provider_name = 'LTI';

    const linkResult = await sqldb.queryOneRowAsync(sql.upsert_current_link, {
      course_instance_id: ltiresult.course_instance_id,
      context_id: parameters.context_id,
      resource_link_id: parameters.resource_link_id,
      resource_link_title: parameters.resource_link_title || '',
      resource_link_description: parameters.resource_link_description || '',
    });

    // Do we have an assessment linked to this resource_link_id?
    if (linkResult.rows[0].assessment_id) {
      if ('lis_result_sourcedid' in parameters) {
        // Save outcomes here
        await sqldb.queryAsync(sql.upsert_outcome, {
          user_id: tokenData.user_id,
          assessment_id: linkResult.rows[0].assessment_id,
          lis_result_sourcedid: parameters.lis_result_sourcedid,
          lis_outcome_service_url: parameters.lis_outcome_service_url,
          lti_credential_id: ltiresult.id,
        });
      }

      res.redirect(
        `${res.locals.urlPrefix}/course_instance/${ltiresult.course_instance_id}/assessment/${linkResult.rows[0].assessment_id}/`,
      );
    } else {
      // No linked assessment

      const instructorResult = await sqldb.callAsync('users_is_instructor_in_course_instance', [
        tokenData.user_id,
        ltiresult.course_instance_id,
      ]);

      if (instructorResult.rowCount === 0) {
        throw error.make(403, 'Access denied (could not determine if user is instructor)');
      }

      if (!instructorResult.rows[0].is_instructor) {
        // Show an error that the assignment is unavailable
        throw error.make(403, 'Assignment not available yet');
      }

      res.redirect(
        `${res.locals.urlPrefix}/course_instance/${ltiresult.course_instance_id}/instructor/instance_admin/lti`,
      );
    }
  }),
);

module.exports = router;
