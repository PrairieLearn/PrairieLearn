import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import * as error from '@prairielearn/error';
import { loadSqlEquiv, queryAsync } from '@prairielearn/postgres';

import {
  selectLti13CombinedInstancesForCourseInstance,
  selectOptionalLti13CombinedInstance,
} from '../../lib/lti13.js';

import { InstructorInstanceAdminLti13Settings } from './instructorInstanceAdminLti13Settings.html.js';

const sql = loadSqlEquiv(import.meta.url);
const router = Router({ mergeParams: true });

router.get(
  '/:unsafe_lti13_course_instance_id/settings',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_instance_permission_edit) {
      throw new error.HttpStatusError(403, 'Access denied (must be a student data editor)');
    }

    const instance = await selectOptionalLti13CombinedInstance({
      lti13_course_instance_id: req.params.unsafe_lti13_course_instance_id,
      course_instance_id: res.locals.course_instance.id,
    });

    if (!instance) {
      throw new error.HttpStatusError(404, 'Not found');
    }

    const instances = await selectLti13CombinedInstancesForCourseInstance({
      course_instance_id: res.locals.course_instance.id,
    });

    res.send(
      InstructorInstanceAdminLti13Settings({
        resLocals: res.locals,
        instance,
        instances,
      }),
    );
  }),
);

router.post(
  '/:unsafe_lti13_course_instance_id/settings',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_instance_permission_edit) {
      throw new error.HttpStatusError(403, 'Access denied (must be a student data editor)');
    }

    if (req.body.__action === 'delete_lti13_course_instance') {
      await queryAsync(sql.delete_lti13_course_instance, {
        course_instance_id: res.locals.course_instance.id,
        lti13_course_instance_id: req.params.unsafe_lti13_course_instance_id,
      });

      // Redirect away so they don't get an error page
      res.redirect(
        `/pl/course_instance/${res.locals.course_instance.id}/instructor/instance_admin/lti13_instance`,
      );
    } else {
      throw new error.HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;
