import { Router } from 'express';
import { z } from 'zod';
import asyncHandler = require('express-async-handler');
import { loadSqlEquiv, queryRow } from '@prairielearn/postgres';
import { getInstitution } from '../utils';
import { CourseInstanceSchema, CourseSchema } from '../../../lib/db-types';
import { InstitutionAdminCourseInstance } from './courseInstance.html';

const sql = loadSqlEquiv(__filename);
const router = Router({ mergeParams: true });

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const institution = await getInstitution(req.params.institution_id);
    const { course, course_instance } = await queryRow(
      sql.select_course_and_instance,
      {
        institution_id: req.params.institution_id,
        course_id: req.params.course_id,
        course_instance_id: req.params.course_instance_id,
      },
      z.object({
        course: CourseSchema,
        course_instance: CourseInstanceSchema,
      })
    );
    res.send(
      InstitutionAdminCourseInstance({
        institution,
        course,
        courseInstance: course_instance,
        resLocals: res.locals,
      })
    );
  })
);

export default router;
