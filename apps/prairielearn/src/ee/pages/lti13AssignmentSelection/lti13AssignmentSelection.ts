import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import { HttpStatusError } from '@prairielearn/error';
import { loadSqlEquiv, queryOptionalRow } from '@prairielearn/postgres';

import { Lti13CourseInstanceSchema } from '../../../lib/db-types.js';
import { Lti13Claim } from '../../lib/lti13.js';

const router = Router({ mergeParams: true });
const sql = loadSqlEquiv(import.meta.url);

router.all(
  '/',
  asyncHandler(async (req, res) => {
    res.removeHeader('content-security-policy');
    res.removeHeader('x-frame-options');
    const ltiClaim = new Lti13Claim(req);

    // Get lti13_course_instance info, if present
    const lti13_course_instance = await queryOptionalRow(
      sql.select_lti13_course_instance,
      {
        lti13_instance_id: req.params.lti13_instance_id,
        deployment_id: ltiClaim.deployment_id,
        context_id: ltiClaim.context?.id,
      },
      Lti13CourseInstanceSchema,
    );

    if (lti13_course_instance) {
      // Redirect to course instance assignment selection
      res.redirect(
        `/pl/course_instance/${lti13_course_instance.course_instance_id}/instructor/instance_admin/lti13_assignment_selection/${lti13_course_instance.id}`,
      );
      return;
    }

    throw new HttpStatusError(403, 'Access denied');

    /*

    GET
    lti13_claims includes

    lti_message_type: LtiDeepLinkingRequest

      'https://purl.imsglobal.org/spec/lti-dl/claim/deep_linking_settings': {
    errors: { errors: {} },
    auto_create: false,
    accept_types: [ 'ltiResourceLink' ],
    accept_multiple: false,
    accept_media_types: 'application/vnd.ims.lti.v1.ltilink',
    validation_context: null,
    deep_link_return_url: 'https://canvas.tbkenny.com/courses/3/deep_linking_response?data=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJub25jZSI6IjAzNDAwMzZlLTU2MTItNGE1Ni05MjM4LTIyYzZjYjlmYzAzNyIsIm1vZGFsIjp0cnVlLCJwbGFjZW1lbnQiOiJhc3NpZ25tZW50X3NlbGVjdGlvbiIsImFzc2lnbm1lbnRfaWQiOjM1Nn0.-5bjz5D5cCwVPNFBzlHYJiBqE-56117UiEgVOq5BIsE',
    accept_presentation_document_targets: [ 'iframe', 'window' ]
  }

  Response
  https://www.imsglobal.org/spec/lti-dl/v2p0#deep-linking-response-message

  {
  type: 'ltiResourceLink',
  url: $url,
  window: '_blank',
  lineItem: {}
  }

  Redirect to deep_link_return_url
  POST using the JWT parameter

  lti_message_type: LtiDeepLinkingResponse

      */
  }),
);

export default router;
