import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import * as error from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';

import { getCourseOwners } from '../../lib/course.js';

import { InstructorInstanceAdminLti } from './instructorInstanceAdminLti.html.js';
import { AssessmentSchema, LtiCredentialSchema, LtiLinkSchema } from '../../lib/db-types.js';
import z from 'zod';

const router = Router();
const sql = sqldb.loadSqlEquiv(import.meta.url);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_permission_edit) {
      res.locals.course_owners = await getCourseOwners(res.locals.course.id);
      res.status(403).send(InstructorInstanceAdminLti({ resLocals: res.locals }));
      return;
    }

    const result = await sqldb.queryRow(
      sql.lti_data,
      {
        course_instance_id: res.locals.course_instance.id,
      },
      z.object({
        assessments: z.object({
          assessment_id: AssessmentSchema.shape.id,
          label: z.string(),
          title: AssessmentSchema.shape.title,
          tid: AssessmentSchema.shape.tid,
        }),
        lti_credentials: z.object({
          id: LtiCredentialSchema.shape.id,
          course_instance_id: LtiCredentialSchema.shape.course_instance_id,
          consumer_key: LtiCredentialSchema.shape.consumer_key,
          secret: LtiCredentialSchema.shape.secret,
          created: z.string(),
          deleted: z.string(),
          created_at: LtiCredentialSchema.shape.created_at,
        }),
        lti_links: z.object({
          id: LtiLinkSchema.shape.id,
          resource_link_title: LtiLinkSchema.shape.resource_link_title,
          resource_link_description: LtiLinkSchema.shape.resource_link_description,
          assessment_id: LtiLinkSchema.shape.assessment_id,
          created_at: LtiLinkSchema.shape.created_at,
          created: z.string(),
        }),
      }),
    );
    Object.assign(res.locals, result);

    res.send(InstructorInstanceAdminLti({ resLocals: res.locals }));
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_permission_edit) {
      throw new error.HttpStatusError(403, 'Access denied (must be a course Editor)');
    }
    if (!res.locals.lti11_enabled) {
      throw new error.HttpStatusError(400, 'LTI 1.1 is not enabled.');
    }

    if (req.body.__action === 'lti_new_cred') {
      await sqldb.queryAsync(sql.insert_cred, {
        key: 'K' + randomString(),
        secret: 'S' + randomString(),
        course_instance_id: res.locals.course_instance.id,
      });
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'lti_del_cred') {
      await sqldb.queryAsync(sql.delete_cred, {
        id: req.body.lti_link_id,
        ci_id: res.locals.course_instance.id,
      });
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'lti_link_target') {
      await sqldb.queryAsync(sql.update_link, {
        assessment_id: req.body.newAssessment || null,
        id: req.body.lti_link_id,
        ci_id: res.locals.course_instance.id,
      });
      res.redirect(req.originalUrl);
    } else {
      throw new error.HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;

function randomString() {
  const len = 10;
  return (
    Math.random().toString(36).substring(2, len) + Math.random().toString(36).substring(2, len)
  );
}
