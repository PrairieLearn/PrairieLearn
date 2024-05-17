import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import { loadSqlEquiv, queryAsync, queryRows } from '@prairielearn/postgres';

import { Lti13CourseInstanceSchema, Lti13InstanceSchema } from '../../../lib/db-types.js';

import { InstructorInstanceAdminLti13 } from './instructorInstanceAdminLti13.html.js';

const sql = loadSqlEquiv(import.meta.url);
const router = Router({ mergeParams: true });

router.get(
  '/:unsafe_lti13_course_instance_id?',
  asyncHandler(async (req, res) => {
    const instances = await queryRows(
      sql.select_lti13_course_instances,
      {
        course_instance_id: res.locals.course_instance.id,
      },
      z.object({
        lti13_course_instance: Lti13CourseInstanceSchema,
        lti13_instance: Lti13InstanceSchema,
      }),
    );

    // Handle the no parameter offered case, take the first one
    if (!req.params.unsafe_lti13_course_instance_id) {
      const lti13_course_instance_id = instances[0].lti13_course_instance.id;

      res.redirect(
        `/pl/course_instance/${res.locals.course_instance.id}/instructor/instance_admin/lti13_instance/${lti13_course_instance_id}`,
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
      InstructorInstanceAdminLti13({
        resLocals: res.locals,
        lti13Instance: instance.lti13_instance,
        lti13CourseInstance: instance.lti13_course_instance,
        lti13CourseInstances: instances.map((ci) => ci.lti13_course_instance),
      }),
    );
  }),
);

router.post(
  '/:unsafe_lti13_course_instance_id',
  asyncHandler(async (req, res) => {
    if (req.body.__action === 'delete_lti13_course_instance') {
      await queryAsync(sql.delete_lti13_course_instance, {
        course_instance_id: res.locals.course_instance.id,
        lti13_course_instance_id: req.params.unsafe_lti13_course_instance_id,
      });

      // Redirect away so they don't get an error page
      res.redirect(
        `/pl/course_instance/${res.locals.course_instance.id}/instructor/instance_admin/assessments`,
      );
    } else {
      throw error.make(400, `Unknown action: ${req.body.__action}`);
    }
  }),
);

export default router;
