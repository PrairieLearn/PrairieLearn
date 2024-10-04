import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import { Issuer } from 'openid-client';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import { html } from '@prairielearn/html';
import { loadSqlEquiv, queryRow, queryRows } from '@prairielearn/postgres';

import { AssessmentSchema, AssessmentSetSchema } from '../../../lib/db-types.js';
import {
  Lti13Claim,
  validateLti13CourseInstance,
  Lti13CombinedInstanceSchema,
} from '../../lib/lti13.js';

const sql = loadSqlEquiv(import.meta.url);
const router = Router({ mergeParams: true });

export const AssessmentRowSchema = AssessmentSchema.merge(
  AssessmentSetSchema.pick({ abbreviation: true, name: true, color: true }),
).extend({
  start_new_assessment_group: z.boolean(),
  assessment_group_heading: AssessmentSetSchema.shape.heading,
  label: z.string(),
});
type AssessmentRow = z.infer<typeof AssessmentRowSchema>;

router.use(
  asyncHandler(async (req, res, next) => {
    if (!(await validateLti13CourseInstance(res.locals))) {
      throw new error.HttpStatusError(403, 'LTI 1.3 is not available');
    }
    next();
  }),
);

router.get(
  '/:unsafe_lti13_course_instance_id',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_instance_permission_edit) {
      throw new error.HttpStatusError(403, 'Access denied (must be a student data editor)');
    }

    res.removeHeader('content-security-policy');
    res.removeHeader('x-frame-options');

    const { lti13_instance, lti13_course_instance } = await queryRow(
      sql.select_lti13_instance,
      {
        course_instance_id: res.locals.course_instance.id,
        unsafe_lti13_course_instance_id: req.params.unsafe_lti13_course_instance_id,
      },
      Lti13CombinedInstanceSchema,
    );

    const assessments = await queryRows(
      sql.select_assessments,
      {
        course_instance_id: res.locals.course_instance.id,
        authz_data: res.locals.authz_data,
        req_date: res.locals.req_date,
        assessments_group_by: res.locals.course_instance.assessments_group_by,
      },
      AssessmentRowSchema,
    );

    console.log(assessments);

    console.log(lti13_instance, lti13_course_instance);
    console.log(req.session.lti13_claims);

    const issuer = new Issuer(lti13_instance.issuer_params);
    const client = new issuer.Client(lti13_instance.client_params, lti13_instance.keystore);

    /* https://www.imsglobal.org/spec/lti-dl/v2p0#deep-linking-response-message
     * and
     * https://www.imsglobal.org/spec/lti-dl/v2p0#lti-resource-link
     */
    const signed_jwt = await client.requestObject({
      'https://purl.imsglobal.org/spec/lti/claim/message_type': 'LtiDeepLinkingResponse',
      'https://purl.imsglobal.org/spec/lti/claim/version': '1.3.0',
      'https://purl.imsglobal.org/spec/lti/claim/deployment_id':
        lti13_course_instance.deployment_id,
      'https://purl.imsglobal.org/spec/lti-dl/claim/content_items': [
        {
          type: 'ltiResourceLink',
          url: 'https://pl.tbkenny.com/pl/course_instance/16/assessment/463',
          window: {
            targetName: '_blank',
          },
        },
      ],
      //'https://purl.imsglobal.org/spec/lti-dl/claim/msg': 'All done!',
    });

    const ltiClaim = new Lti13Claim(req);
    const deep_link_return_url = ltiClaim.get([
      'https://purl.imsglobal.org/spec/lti-dl/claim/deep_linking_settings',
      'deep_link_return_url',
    ]);

    res.send(
      html`
        <form method="POST" action="${deep_link_return_url}">
          <input type="hidden" name="JWT" value="${signed_jwt}" />
          <input type="submit" value="Save" />
        </form>
      `.toString(),
    );
  }),
);

export default router;
