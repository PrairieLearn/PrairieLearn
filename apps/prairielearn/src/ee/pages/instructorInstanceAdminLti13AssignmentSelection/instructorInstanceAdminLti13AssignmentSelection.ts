import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import { Issuer } from 'openid-client';

import * as error from '@prairielearn/error';
import { loadSqlEquiv, queryRow, queryRows } from '@prairielearn/postgres';

import { getCanonicalHost } from '../../../lib/url.js';
import { selectAssessmentInCourseInstance } from '../../../models/assessment.js';
import {
  Lti13Claim,
  validateLti13CourseInstance,
  Lti13CombinedInstanceSchema,
} from '../../lib/lti13.js';

import {
  InstructorInstanceAdminLti13AssignmentSelection,
  AssessmentRowSchema,
  InstructorInstanceAdminLti13AssignmentConfirmation,
  InstructorInstanceAdminLti13AssignmentDetails,
} from './instructorInstanceAdminLti13AssignmentSelection.html.js';

const sql = loadSqlEquiv(import.meta.url);
const router = Router({ mergeParams: true });

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

    console.log(req.params);

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

    res.send(
      InstructorInstanceAdminLti13AssignmentSelection({
        resLocals: res.locals,
        assessments,
      }),
    );
  }),
);

router.post(
  '/:unsafe_lti13_course_instance_id',
  asyncHandler(async (req, res) => {
    if (req.body.__action === 'details') {
      const assessment = await selectAssessmentInCourseInstance({
        unsafe_assessment_id: req.body.unsafe_assessment_id,
        course_instance_id: res.locals.course_instance.id,
      });

      console.log(assessment);

      res.send(
        InstructorInstanceAdminLti13AssignmentDetails({ resLocals: res.locals, assessment }),
      );
    } else if (req.body.__action === 'confirm') {
      const assessment = await selectAssessmentInCourseInstance({
        unsafe_assessment_id: req.body.unsafe_assessment_id,
        course_instance_id: res.locals.course_instance.id,
      });

      console.log(assessment);

      const { lti13_instance, lti13_course_instance } = await queryRow(
        sql.select_lti13_instance,
        {
          course_instance_id: res.locals.course_instance.id,
          unsafe_lti13_course_instance_id: req.params.unsafe_lti13_course_instance_id,
        },
        Lti13CombinedInstanceSchema,
      );

      const host = getCanonicalHost(req);

      //console.log(lti13_instance, lti13_course_instance);
      //console.log(req.session.lti13_claims);

      const issuer = new Issuer(lti13_instance.issuer_params);
      const client = new issuer.Client(lti13_instance.client_params, lti13_instance.keystore);

      /* https://www.imsglobal.org/spec/lti-dl/v2p0#deep-linking-response-message
       * and
       * https://www.imsglobal.org/spec/lti-dl/v2p0#lti-resource-link
       * and
       * https://canvas.instructure.com/doc/api/file.content_item.html
       */
      const signed_jwt = await client.requestObject({
        'https://purl.imsglobal.org/spec/lti/claim/message_type': 'LtiDeepLinkingResponse',
        'https://purl.imsglobal.org/spec/lti/claim/version': '1.3.0',
        'https://purl.imsglobal.org/spec/lti/claim/deployment_id':
          lti13_course_instance.deployment_id,
        'https://purl.imsglobal.org/spec/lti-dl/claim/content_items': [
          {
            type: 'ltiResourceLink',
            url: `${host}/pl/course_instance/${assessment.course_instance_id}/assessment/${assessment.id}`,
            window: {
              targetName: '_blank',
            },
            lineItem: {
              // Updates the points in Canvas
              //scoreMaximum: assessment.max_points, // 100
              // Updates the name in Canvas
              label: assessment.title,
              resourceId: assessment.uuid,
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
        InstructorInstanceAdminLti13AssignmentConfirmation({
          resLocals: res.locals,
          deep_link_return_url,
          signed_jwt,
          platform_name: lti13_instance.tool_platform_name,
          assessment,
        }),
      );
    } else if (req.body.__action === 'link') {
      // Use the information we know about the link we just made
      // Search for it in the lineitems API (resourceId = uuid)
      // Link it automatically

      console.log('GOT HERE');
      console.log(req.body);
      res.send('OK');
    } else {
      throw new error.HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;
