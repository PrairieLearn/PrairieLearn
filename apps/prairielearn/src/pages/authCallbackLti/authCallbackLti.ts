import assert from 'node:assert';

import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import oauthSignature from 'oauth-signature';

import { cache } from '@prairielearn/cache';
import { HttpStatusError } from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';

import { constructCourseOrInstanceContext } from '../../lib/authz-data.js';
import { config } from '../../lib/config.js';
import {
  IdSchema,
  LtiCredentialSchema,
  LtiLinkSchema,
  SprocUsersIsInstructorInCourseInstanceSchema,
} from '../../lib/db-types.js';
import { ensureEnrollment } from '../../models/enrollment.js';
import { selectUserById } from '../../models/user.js';

const TIME_TOLERANCE_SEC = 3000;

const router = Router();
const sql = sqldb.loadSqlEquiv(import.meta.url);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const parameters = structuredClone(req.body);
    const signature = req.body.oauth_signature;
    delete parameters.oauth_signature;

    const ltiRedirectUrl = config.ltiRedirectUrl;
    if (!ltiRedirectUrl) {
      throw new HttpStatusError(404, 'LTI not configured');
    }

    if (parameters.lti_message_type !== 'basic-lti-launch-request') {
      throw new HttpStatusError(400, 'Unsupported lti_message_type');
    }

    if (parameters.lti_version !== 'LTI-1p0') {
      throw new HttpStatusError(400, 'Unsupported lti_version');
    }

    if (!parameters.oauth_consumer_key) {
      throw new HttpStatusError(400, 'Badly formed oauth_consumer_key');
    }

    if (!parameters.resource_link_id) {
      throw new HttpStatusError(400, 'Badly formed resource_link_id');
    }

    // FIXME: could warn or throw an error if parameters.roles exists (no longer used)
    // FIXME: could add a parameter that allows setting course role or course instance role

    const ltiResult = await sqldb.queryOptionalRow(
      sql.lookup_credential,
      { consumer_key: parameters.oauth_consumer_key },
      LtiCredentialSchema,
    );
    if (!ltiResult) throw new HttpStatusError(403, 'Unknown consumer_key');

    assert(ltiResult.secret !== null);

    const genSignature = oauthSignature.generate(
      'POST',
      ltiRedirectUrl,
      parameters,
      // TODO: column should be `NOT NULL`
      ltiResult.secret,
      undefined,
      { encodeSignature: false },
    );
    if (genSignature !== signature) {
      throw new HttpStatusError(403, 'Invalid signature');
    }

    // Check oauth_timestamp within N seconds of now (3000 suggested)
    const timeDiff = Math.abs(Math.floor(Date.now() / 1000) - parameters.oauth_timestamp);
    if (timeDiff > TIME_TOLERANCE_SEC) {
      throw new HttpStatusError(403, 'Invalid timestamp');
    }

    // Check nonce hasn't been used by that consumer_key in that timeframe
    // https://oauth.net/core/1.0/#nonce
    const nonceKey = 'authCallbackLti:' + parameters.oauth_timestamp + ':' + parameters.oauth_nonce;
    const nonceVal = await cache.get(nonceKey);

    if (nonceVal) {
      throw new HttpStatusError(403, 'Nonce reused');
    }

    // Remember that this nonce was already used.
    cache.set(nonceKey, true, TIME_TOLERANCE_SEC * 1000);

    // OAuth validation succeeded, next look up and store user authn data
    if (!parameters.user_id) {
      throw new HttpStatusError(
        400,
        'Authentication problem: UserID required. Anonymous access disabled.',
      );
    }

    // Create unique UID from LTI parameters and CI id
    // Not using an email address (parameters.lis_person_contact_email_primary)
    // so that LTI doesn't conflict with other UIDs.
    const authUid =
      parameters.user_id + '@' + parameters.context_id + '::ciid=' + ltiResult.course_instance_id;

    let fallbackName = 'LTI user';
    if (parameters.context_title) {
      fallbackName = `${parameters.context_title} user`;
      // e.g. UIUC Degree Sandbox user
    }
    const authName = parameters.lis_person_name_full || fallbackName;

    const userId = await sqldb.callRow(
      'users_select_or_insert_lti',
      [
        authUid,
        authName,
        ltiResult.course_instance_id,
        parameters.user_id,
        parameters.context_id,
        res.locals.req_date,
      ],
      IdSchema,
    );

    // Persist the user's authentication data in the session. We do this before
    // checking authorization so that user information is available for any
    // subsequent requests or redirects (e.g. if `ensureCheckedEnrollment`
    // redirects to a payment page).
    req.session.user_id = userId;
    req.session.authn_provider_name = 'LTI';

    // Check if the user would have access to the course instance.
    const user = await selectUserById(userId);
    const { authzData, institution, course, courseInstance } =
      await constructCourseOrInstanceContext({
        user,
        course_id: null,
        course_instance_id: ltiResult.course_instance_id,
        ip: req.ip || null,
        req_date: res.locals.req_date,
        is_administrator: res.locals.is_administrator,
      });

    if (!authzData?.has_student_access) {
      throw new HttpStatusError(403, 'Access denied');
    }

    if (!authzData.has_student_access_with_enrollment) {
      assert(courseInstance);
      await ensureEnrollment({
        institution,
        course,
        courseInstance,
        actionDetail: 'implicit_joined',
        authzData,
        requestedRole: 'Student',
      });
    }

    const linkResult = await sqldb.queryRow(
      sql.upsert_current_link,
      {
        course_instance_id: ltiResult.course_instance_id,
        context_id: parameters.context_id,
        resource_link_id: parameters.resource_link_id,
        resource_link_title: parameters.resource_link_title || '',
        resource_link_description: parameters.resource_link_description || '',
      },
      LtiLinkSchema,
    );

    // Do we have an assessment linked to this resource_link_id?
    if (linkResult.assessment_id !== null) {
      if ('lis_result_sourcedid' in parameters) {
        // Save outcomes here
        await sqldb.execute(sql.upsert_outcome, {
          user_id: userId,
          assessment_id: linkResult.assessment_id,
          lis_result_sourcedid: parameters.lis_result_sourcedid,
          lis_outcome_service_url: parameters.lis_outcome_service_url,
          lti_credential_id: ltiResult.id,
        });
      }

      res.redirect(
        `${res.locals.urlPrefix}/course_instance/${ltiResult.course_instance_id}/assessment/${linkResult.assessment_id}/`,
      );
    } else {
      // No linked assessment

      const isInstructor = await sqldb.callRow(
        'users_is_instructor_in_course_instance',
        [userId, ltiResult.course_instance_id],
        SprocUsersIsInstructorInCourseInstanceSchema,
      );

      if (!isInstructor) {
        // Show an error that the assignment is unavailable
        throw new HttpStatusError(403, 'Assignment not available yet');
      }

      res.redirect(
        `${res.locals.urlPrefix}/course_instance/${ltiResult.course_instance_id}/instructor/instance_admin/lti`,
      );
    }
  }),
);

export default router;
