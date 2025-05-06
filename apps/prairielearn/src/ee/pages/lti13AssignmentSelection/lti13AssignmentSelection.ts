import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import { HttpStatusError } from '@prairielearn/error';
import { loadSqlEquiv, queryOptionalRow } from '@prairielearn/postgres';

import { Lti13CourseInstanceSchema } from '../../../lib/db-types.js';
import { Lti13Claim } from '../../lib/lti13.js';

const router = Router({ mergeParams: true });
const sql = loadSqlEquiv(import.meta.url);

router.all(
  '/',
  asyncHandler(async (req, res) => {
    const ltiClaim = new Lti13Claim(req);
    ltiClaim.dump();

    // Get lti13_course_instance info, if present
    const lti13_course_instance = await queryOptionalRow(
      sql.select_lti13_course_instance,
      {
        lti13_instance_id: req.params.lti13_instance_id,
        deployment_id: ltiClaim.deployment_id,
        context_id: ltiClaim.context?.id,
      },
      Lti13CourseInstanceSchema,
    );

    if (lti13_course_instance) {
      // Redirect to course instance assignment selection
      res.redirect(
        `/pl/course_instance/${lti13_course_instance.course_instance_id}/instructor/instance_admin/lti13_assignment_selection/${lti13_course_instance.id}`,
      );
      return;
    }

    throw new HttpStatusError(403, 'Access denied');
  }),
);

export default router;
