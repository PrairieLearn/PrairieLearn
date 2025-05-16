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
  updateLineItemsByAssessment,
} from '../../lib/lti13.js';

import {
  AssessmentRowSchema,
  InstructorInstanceAdminLti13AssignmentSelection,
  InstructorInstanceAdminLti13AssignmentConfirmation,
  InstructorInstanceAdminLti13AssignmentDetails,
} from './instructorInstanceAdminLti13AssignmentSelection.html.js';
import { AssessmentSchema } from '../../../lib/db-types.js';

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
    const instance = await queryRow(
      sql.select_lti13_instance,
      {
        course_instance_id: res.locals.course_instance.id,
        unsafe_lti13_course_instance_id: req.params.unsafe_lti13_course_instance_id,
      },
      Lti13CombinedInstanceSchema,
    );

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

      const host = getCanonicalHost(req);

      //console.log(lti13_instance, lti13_course_instance);
      //console.log(req.session.lti13_claims);

      const issuer = new Issuer(instance.lti13_instance.issuer_params);
      const client = new issuer.Client(
        instance.lti13_instance.client_params,
        instance.lti13_instance.keystore,
      );

      const ltiClaim = new Lti13Claim(req);
      ltiClaim.dump();

      /* https://www.imsglobal.org/spec/lti-dl/v2p0#deep-linking-response-message
       * and
       * https://www.imsglobal.org/spec/lti-dl/v2p0#lti-resource-link
       * and
       * https://canvas.instructure.com/doc/api/file.content_item.html
       */
      const unsigned_jwt = {
        'https://purl.imsglobal.org/spec/lti/claim/message_type': 'LtiDeepLinkingResponse',
        'https://purl.imsglobal.org/spec/lti/claim/version': '1.3.0',
        'https://purl.imsglobal.org/spec/lti/claim/deployment_id':
          instance.lti13_course_instance.deployment_id,
        'https://purl.imsglobal.org/spec/lti-dl/claim/data': ltiClaim.get([
          'https://purl.imsglobal.org/spec/lti-dl/claim/deep_linking_settings',
          'data',
        ]),
        'https://purl.imsglobal.org/spec/lti-dl/claim/content_items': [
          {
            type: 'ltiResourceLink',
            url: `${host}/pl/course_instance/${assessment.course_instance_id}/assessment/${assessment.id}`,
            title: assessment.title,
            window: {
              targetName: '_blank',
            },
            lineItem: {
              // assessment.max_points is NULL if no one has submitted
              scoreMaximum: 100,
              resourceId: assessment.uuid,
            },
          },
        ],
        //'https://purl.imsglobal.org/spec/lti-dl/claim/msg': 'All done!',
      };

      console.log(JSON.stringify(unsigned_jwt, null, 2));

      const deep_link_return_url = ltiClaim.get([
        'https://purl.imsglobal.org/spec/lti-dl/claim/deep_linking_settings',
        'deep_link_return_url',
      ]);

      res.send(
        InstructorInstanceAdminLti13AssignmentConfirmation({
          resLocals: res.locals,
          deep_link_return_url,
          signed_jwt: await client.requestObject(unsigned_jwt),
          platform_name: instance.lti13_instance.tool_platform_name,
          assessment,
        }),
      );
    } else if (req.body.__action === 'link') {
      // Use the information we know about the link we just made
      // Search for it in the lineitems API (resourceId = uuid)
      // Link it automatically

      // Sleep or loop here while the LTI call finishes

      // Canvas doesn't create the line item until the assignment page is saved
      // (user manual not when it returns from the call), so sleep polling is not
      // going to be a good experience here.

      // Tag the lineitem somehow associated with the assessment that we need to refresh?

      console.log('GOT HERE');
      console.log(req.body);

      const assessment = await queryRow(
        sql.select_assessment_in_course_instance,
        {
          unsafe_assessment_id: req.body.unsafe_assessment_id,
          course_instance_id: res.locals.course_instance.id,
        },
        AssessmentSchema,
      );
      await updateLineItemsByAssessment(instance, assessment.id);

      res.end('OK');
    } else {
      throw new error.HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;
