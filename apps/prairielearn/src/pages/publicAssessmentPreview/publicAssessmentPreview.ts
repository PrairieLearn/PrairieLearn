// @ts-check
import { pipeline } from 'node:stream/promises';

import * as express from 'express';
import asyncHandler from 'express-async-handler';

import * as error from '@prairielearn/error';
import { flash } from '@prairielearn/flash';
import * as sqldb from '@prairielearn/postgres';

import { setCourseInstanceCopyTargets } from '../../lib/copy-course-instance.js';
import { IdSchema } from '../../lib/db-types.js';
import { CourseInstanceCopyEditor } from '../../lib/editors.js';
import { selectCourseInstanceById } from '../../models/course-instances.js';
import { selectCourseById, selectCourseIdByInstanceId } from '../../models/course.js';

import { AssessmentRowSchema, InstructorAssessments } from './publicAssessmentPreview.html.js';

const router = express.Router();
const sql = sqldb.loadSqlEquiv(import.meta.url);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const courseId = await selectCourseIdByInstanceId(res.locals.course_instance_id);
    res.locals.course = await selectCourseById(courseId);
    res.locals.course_instance = await selectCourseInstanceById(res.locals.course_instance_id);
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

    res.locals.user = res.locals.authn_user; // TEST, need res.locals.user for setCourseInstanceCopyTargets
    await setCourseInstanceCopyTargets(res);

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
