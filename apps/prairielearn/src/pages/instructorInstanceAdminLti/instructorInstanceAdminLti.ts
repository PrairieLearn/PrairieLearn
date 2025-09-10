import crypto from 'node:crypto';

import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import * as error from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';

import { InsufficientCoursePermissionsCardPage } from '../../components/InsufficientCoursePermissionsCard.js';
import { getCourseOwners } from '../../lib/course.js';

import { InstructorInstanceAdminLti, LtiDataSchema } from './instructorInstanceAdminLti.html.js';

const router = Router();
const sql = sqldb.loadSqlEquiv(import.meta.url);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_permission_edit) {
      // Access denied, but instead of sending them to an error page, we'll show
      // them an explanatory message and prompt them to get the right permissions.
      const courseOwners = await getCourseOwners(res.locals.course.id);
      res.status(403).send(
        InsufficientCoursePermissionsCardPage({
          resLocals: res.locals,
          navContext: {
            type: 'instructor',
            page: 'instance_admin',
            subPage: 'lti',
          },
          courseOwners,
          pageTitle: 'LTI configuration',
          requiredPermissions: 'Editor',
        }),
      );
      return;
    }

    const { assessments, lti_credentials, lti_links } = await sqldb.queryRow(
      sql.lti_data,
      { course_instance_id: res.locals.course_instance.id },
      LtiDataSchema,
    );

    res.send(
      InstructorInstanceAdminLti({
        resLocals: res.locals,
        assessments,
        lti_credentials,
        lti_links,
      }),
    );
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
      await sqldb.execute(sql.insert_cred, {
        key: 'K' + randomString(),
        secret: 'S' + randomString(),
        course_instance_id: res.locals.course_instance.id,
      });
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'lti_del_cred') {
      await sqldb.execute(sql.delete_cred, {
        id: req.body.lti_link_id,
        ci_id: res.locals.course_instance.id,
      });
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'lti_link_target') {
      await sqldb.execute(sql.update_link, {
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
