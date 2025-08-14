import crypto from 'node:crypto';

import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import z from 'zod';

import * as error from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';

import { getCourseOwners } from '../../lib/course.js';
import { AssessmentSchema, LtiCredentialSchema, LtiLinkSchema } from '../../lib/db-types.js';

import { InstructorInstanceAdminLti } from './instructorInstanceAdminLti.html.js';

const router = Router();
const sql = sqldb.loadSqlEquiv(import.meta.url);

const LtiDataSchema = z.object({
  assessments: z
    .array(
      z.object({
        assessment_id: AssessmentSchema.shape.id,
        label: z.string(),
        title: AssessmentSchema.shape.title,
        tid: AssessmentSchema.shape.tid,
      }),
    )
    .nullable(),
  lti_credentials: z
    .array(
      z.object({
        ...LtiCredentialSchema.pick({
          id: true,
          course_instance_id: true,
          consumer_key: true,
          secret: true,
          created_at: true,
        }).shape,
        created: z.string(),
        deleted: z.string(),
      }),
    )
    .nullable(),
  lti_links: z
    .array(
      z.object({
        ...LtiLinkSchema.pick({
          id: true,
          resource_link_title: true,
          resource_link_description: true,
          assessment_id: true,
          created_at: true,
        }).shape,
        created: z.string(),
      }),
    )
    .nullable(),
});

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
      { course_instance_id: res.locals.course_instance.id },
      LtiDataSchema,
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

/** Generates a cryptographically secure random alphanumeric string. */
function randomString(length = 32) {
  // Each byte is two hex characters, so we need Math.ceil(length / 2)
  return crypto
    .randomBytes(Math.ceil(length / 2))
    .toString('hex')
    .slice(0, length);
}
