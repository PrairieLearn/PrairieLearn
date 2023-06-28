import { Router } from 'express';
import { z } from 'zod';
import asyncHandler = require('express-async-handler');
import error = require('@prairielearn/error');
import { loadSqlEquiv, queryAsync, queryRow } from '@prairielearn/postgres';
import { getInstitution } from '../../lib/institution';
import { CourseInstanceSchema, CourseSchema } from '../../../lib/db-types';
import { InstitutionAdminCourseInstance } from './institutionAdminCourseInstance.html';

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
        course_instance,
        resLocals: res.locals,
      })
    );
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (req.body.__action === 'update_enrollment_limit') {
      await queryAsync(sql.update_enrollment_limit, {
        institution_id: req.params.institution_id,
        course_instance_id: req.params.course_instance_id,
        enrollment_limit: req.body.enrollment_limit || null,
      });
      res.redirect(req.originalUrl);
    } else {
      throw error.make(400, 'Unknown action');
    }
  })
);

export default router;
