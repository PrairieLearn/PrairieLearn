import * as express from 'express';
import asyncHandler from 'express-async-handler';

import * as error from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';

import { selectCourseInstanceById } from '../../models/course-instances.js';
import { selectCourseById } from '../../models/course.js';

import { AssessmentRowSchema, InstructorAssessments } from './publicAssessments.html.js';

const router = express.Router();
const sql = sqldb.loadSqlEquiv(import.meta.url);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.locals.course_instance = await selectCourseInstanceById(res.locals.course_instance_id);
    res.locals.course = await selectCourseById(res.locals.course_instance.course_id);
    res.locals.urlPrefix = '/pl';

    try {
      const isPublic = await new Promise((resolve, reject) => {
        sqldb.queryOneRow(
          sql.check_is_public,
          {
            course_instance_id: res.locals.course_instance_id.toString(),
          },
          (err, result) => {
            if (err) {
              console.error('Error checking if course instance is public', err);
              reject(err);
            } else {
              resolve(result);
            }
          },
        );
      });

      if (!isPublic) {
        throw new error.HttpStatusError(404, 'Course instance not public.');
      }
    } catch (err) {
      console.error('Error checking if course instance is public', err);
      throw err;
    }

    const rows = await sqldb.queryRows(
      sql.select_assessments,
      {
        course_instance_id: res.locals.course_instance.id,
        assessments_group_by: res.locals.course_instance.assessments_group_by,
      },
      AssessmentRowSchema,
    );

    res.send(
      InstructorAssessments({
        resLocals: res.locals,
        rows,
        assessmentIdsNeedingStatsUpdate: [], // Don't show on public page
      }),
    );
  }),
);

export default router;
