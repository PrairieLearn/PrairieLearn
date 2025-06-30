import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import * as error from '@prairielearn/error';
import { loadSqlEquiv, queryRow, queryRows, runInTransactionAsync } from '@prairielearn/postgres';

import { Lti13InstanceSchema } from '../../../lib/db-types.js';
import { Lti13CombinedInstanceSchema } from '../../lib/lti13.js';

import { InstructorInstanceAdminLti13Settings } from './instructorInstanceAdminLti13Settings.html.js';

const sql = loadSqlEquiv(import.meta.url);
const router = Router({ mergeParams: true });

router.get(
  '/:unsafe_lti13_course_instance_id/settings',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_instance_permission_edit) {
      throw new error.HttpStatusError(403, 'Access denied (must be a student data editor)');
    }

    const instances = await queryRows(
      sql.select_combined_lti13_instances,
      { course_instance_id: res.locals.course_instance.id },
      Lti13CombinedInstanceSchema,
    );

    if (instances.length === 0) {
      // This can happen if the user navigates to the page after the LTI course instance
      // has been deleted. We'll redirect to the base LTI page, which will show the
      // "no instances" page.
      res.redirect(
        `/pl/course_instance/${res.locals.course_instance.id}/instructor/instance_admin/lti13`,
      );
      return;
    }

    const instance = instances.find(
      (i) => i.lti13_course_instance.id === req.params.unsafe_lti13_course_instance_id,
    );

    if (!instance) {
      throw error.make(404, 'LTI 1.3 instance not found.');
    }

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
      await runInTransactionAsync(async () => {
        await queryRow(
          sql.delete_lti13_course_instance,
          {
            course_instance_id: res.locals.course_instance.id,
            lti13_course_instance_id: req.params.unsafe_lti13_course_instance_id,
          },
          Lti13InstanceSchema,
        );
      });

      // Redirect away so they don't get an error page
      res.redirect(
        `/pl/course_instance/${res.locals.course_instance.id}/instructor/instance_admin/lti13`,
      );
    } else {
      throw new error.HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;
