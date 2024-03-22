import { Router } from 'express';
import asyncHandler = require('express-async-handler');
import { loadSqlEquiv, queryAsync, queryRow } from '@prairielearn/postgres';
import * as error from '@prairielearn/error';
import { InstructorInstanceAdminLti13 } from './instructorInstanceAdminLti13.html';
import { selectLti13InstancesByCourseInstance } from '../../models/lti13Instance';
import { Lti13CourseInstanceSchema } from '../../../lib/db-types';

const sql = loadSqlEquiv(__filename);
const router = Router({ mergeParams: true });

router.get(
  '/:unsafe_lti13_instance_id?',
  asyncHandler(async (req, res) => {
    const lti13Instances = await selectLti13InstancesByCourseInstance(
      res.locals.course_instance.id,
    );

    // Handle the no parameter offered case, take the first one
    if (!req.params.unsafe_lti13_instance_id) {
      const lti13_instance_id = lti13Instances[0].id;

      res.redirect(
        `/pl/course_instance/${res.locals.course_instance.id}/instructor/instance_admin/lti13_instance/${lti13_instance_id}`,
      );
      return;
    }

    const lti13Instance = lti13Instances.find(
      (li) => li.id === req.params.unsafe_lti13_instance_id,
    );

    if (!lti13Instance) {
      throw error.make(404, 'LTI 1.3 instance not found.');
    }

    const lti13CourseInstance = await queryRow(
      sql.select_lti13_course_instance,
      {
        course_instance_id: res.locals.course_instance.id,
        lti13_instance_id: lti13Instance.id,
      },
      Lti13CourseInstanceSchema,
    );

    res.send(
      InstructorInstanceAdminLti13({
        resLocals: res.locals,
        lti13Instance,
        lti13Instances,
        lti13CourseInstance,
      }),
    );
  }),
);

router.post(
  '/:unsafe_lti13_instance_id',
  asyncHandler(async (req, res) => {
    if (req.body.__action === 'delete_lti13_course_instance') {
      await queryAsync(sql.delete_lti13_course_instance, {
        course_instance_id: res.locals.course_instance.id,
        lti13_instance_id: req.params.unsafe_lti13_instance_id,
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
