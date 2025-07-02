import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import { HttpStatusError } from '@prairielearn/error';
import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import { Lti13InstanceSchema } from '../../../lib/db-types.js';
import { Lti13CombinedInstanceSchema } from '../../lib/lti13.js';

import { InstructorInstanceAdminLti13NoInstances } from './instructorInstanceAdminLti13.html.js';

const router = Router({ mergeParams: true });
const sql = loadSqlEquiv(import.meta.url);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_instance_permission_edit) {
      throw new HttpStatusError(403, 'Access denied (must be a student data editor)');
    }

    const instances = await queryRows(
      sql.select_combined_lti13_instances,
      { course_instance_id: res.locals.course_instance.id },
      Lti13CombinedInstanceSchema,
    );

    if (instances.length === 0) {
      // See if we have configurations per institution
      const lti13_instances = await queryRows(
        sql.select_lti13_instances,
        { institution_id: res.locals.institution.id },
        Lti13InstanceSchema,
      );

      res.send(
        InstructorInstanceAdminLti13NoInstances({
          resLocals: res.locals,
          lti13_instances,
        }),
      );
      return;
    }

    res.redirect(
      `/pl/course_instance/${res.locals.course_instance.id}/instructor/instance_admin/lti13_instance/${instances[0].lti13_course_instance.id}/assessments`,
    );
  }),
);

// For backwards-compatibility, redirect to the "Assessments" page if no
// specific subpage was requested.
router.get(
  '/:lti13_course_instance_id(\\d+)',
  asyncHandler(async (req, res) => {
    res.redirect(
      `/pl/course_instance/${res.locals.course_instance.id}/instructor/instance_admin/lti13_instance/${req.params.lti13_course_instance_id}/assessments`,
    );
  }),
);

export default router;
