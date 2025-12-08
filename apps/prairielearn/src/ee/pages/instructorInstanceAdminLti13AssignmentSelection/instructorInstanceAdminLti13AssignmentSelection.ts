import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import { Issuer } from 'openid-client';

import * as error from '@prairielearn/error';
import { loadSqlEquiv, queryRow, queryRows } from '@prairielearn/postgres';

import { renderText } from '../../../lib/assessment.js';
import { type Lti13Assessments, Lti13AssessmentsSchema } from '../../../lib/db-types.js';
import { getCanonicalHost } from '../../../lib/url.js';
import { selectAssessments } from '../../../models/assessment.js';
import { Lti13Claim, Lti13CombinedInstanceSchema } from '../../lib/lti13.js';

import {
  type ContentItemLtiResourceLink,
  ContentItemLtiResourceLinkSchema,
  InstructorInstanceAdminLti13AssignmentConfirmation,
  InstructorInstanceAdminLti13AssignmentSelection,
} from './instructorInstanceAdminLti13AssignmentSelection.html.js';

const sql = loadSqlEquiv(import.meta.url);
const router = Router({ mergeParams: true });

router.use(
  asyncHandler(async (req, res, next) => {
    if (!res.locals.lti13_enabled) {
      throw new error.HttpStatusError(403, 'LTI 1.3 is not available');
    }
    if (!res.locals.authz_data.has_course_instance_permission_edit) {
      throw new error.HttpStatusError(403, 'Access denied (must be a student data editor)');
    }
    next();
  }),
);

router.get(
  '/:unsafe_lti13_course_instance_id',
  asyncHandler(async (req, res) => {
    const instance = await queryRow(
      sql.select_lti13_combined_instance,
      {
        course_instance_id: res.locals.course_instance.id,
        unsafe_lti13_course_instance_id: req.params.unsafe_lti13_course_instance_id,
      },
      Lti13CombinedInstanceSchema,
    );

    const assessments = await selectAssessments({
      course_instance_id: res.locals.course_instance.id,
    });

    const lti13_assessments = await queryRows(
      sql.select_lti13_assessments,
      {
        unsafe_lti13_course_instance_id: req.params.unsafe_lti13_course_instance_id,
        course_instance_id: res.locals.course_instance.id,
      },
      Lti13AssessmentsSchema,
    );

    const lti13AssessmentsByAssessmentId: Record<string, Lti13Assessments> = {};
    for (const a of lti13_assessments) {
      lti13AssessmentsByAssessmentId[a.assessment_id] = a;
    }

    res.send(
      InstructorInstanceAdminLti13AssignmentSelection({
        resLocals: res.locals,
        assessments,
        assessmentsGroupBy: res.locals.course_instance.assessments_group_by,
        lti13AssessmentsByAssessmentId,
        courseName: instance.lti13_course_instance.context_label ?? 'course',
        lmsName: instance.lti13_instance.name ?? 'LMS',
      }),
    );
  }),
);

router.post(
  '/:unsafe_lti13_course_instance_id',
  asyncHandler(async (req, res) => {
    const instance = await queryRow(
      sql.select_lti13_combined_instance,
      {
        course_instance_id: res.locals.course_instance.id,
        unsafe_lti13_course_instance_id: req.params.unsafe_lti13_course_instance_id,
      },
      Lti13CombinedInstanceSchema,
    );

    if (req.body.__action === 'confirm') {
      const assessments = await selectAssessments({
        course_instance_id: res.locals.course_instance.id,
      });

      const assessment = assessments.find((a) => a.id === req.body.unsafe_assessment_id);

      if (!assessment) {
        throw new error.HttpStatusError(400, 'Invalid assessment');
      }

      const host = getCanonicalHost(req);
      const issuer = new Issuer(instance.lti13_instance.issuer_params);
      const client = new issuer.Client(
        instance.lti13_instance.client_params,
        instance.lti13_instance.keystore,
      );
      const ltiClaim = new Lti13Claim(req);

      const contentItem: ContentItemLtiResourceLink = {
        type: 'ltiResourceLink',
        url: `${host}/pl/course_instance/${res.locals.course_instance.id}/assessment/${assessment.id}`,
        window: {
          targetName: '_blank',
        },
      };
      if ('setName' in req.body) {
        contentItem.title = `${assessment.label}: ${assessment.title}`;
      }
      if ('setText' in req.body && assessment.text) {
        contentItem.text = renderText(assessment, res.locals.urlPrefix) ?? undefined;
      }
      if ('setPoints' in req.body) {
        contentItem.lineItem = {
          scoreMaximum: 100,
          resourceId: assessment.id,
        };
      }
      const contentItemParsed = ContentItemLtiResourceLinkSchema.parse(contentItem);

      // https://www.imsglobal.org/spec/lti-dl/v2p0#deep-linking-response-message
      const deepLinkingResponse = {
        'https://purl.imsglobal.org/spec/lti/claim/message_type': 'LtiDeepLinkingResponse',
        'https://purl.imsglobal.org/spec/lti/claim/version': '1.3.0',
        'https://purl.imsglobal.org/spec/lti/claim/deployment_id':
          instance.lti13_course_instance.deployment_id,
        'https://purl.imsglobal.org/spec/lti-dl/claim/data':
          ltiClaim.get([
            'https://purl.imsglobal.org/spec/lti-dl/claim/deep_linking_settings',
            'data',
          ]) ?? undefined,
        'https://purl.imsglobal.org/spec/lti-dl/claim/content_items': [contentItemParsed],
      };

      const deep_link_return_url = ltiClaim.get([
        'https://purl.imsglobal.org/spec/lti-dl/claim/deep_linking_settings',
        'deep_link_return_url',
      ]);
      if (!deep_link_return_url) {
        throw new error.HttpStatusError(
          400,
          `Invalid deep_link_return_url: ${deep_link_return_url}`,
        );
      }

      res.send(
        InstructorInstanceAdminLti13AssignmentConfirmation({
          resLocals: res.locals,
          deep_link_return_url,
          signed_jwt: await client.requestObject(deepLinkingResponse),
          contentItem: contentItemParsed,
          lmsName: instance.lti13_instance.name,
          assessment,
        }),
      );
    } else {
      throw new error.HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;
