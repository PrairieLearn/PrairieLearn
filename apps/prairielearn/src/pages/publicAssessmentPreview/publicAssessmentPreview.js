// @ts-check
import { pipeline } from 'node:stream/promises';

import * as express from 'express';
import asyncHandler from 'express-async-handler';

import * as error from '@prairielearn/error';
import { flash } from '@prairielearn/flash';
import * as sqldb from '@prairielearn/postgres';

import { CourseInstanceCopyEditor } from '../../lib/editors.js';
import { IdSchema } from '../../lib/db-types.js';
import { selectCourseById, selectCourseIdByInstanceId } from '../../models/course.js';
import { selectCourseInstanceById } from '../../models/course-instances.js';

import { AssessmentRowSchema, InstructorAssessments } from './publicAssessmentPreview.html.js';

const router = express.Router();
const sql = sqldb.loadSqlEquiv(import.meta.url);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const courseId = await selectCourseIdByInstanceId(res.locals.course_instance_id);
    res.locals.course = await selectCourseById(courseId);
    res.locals.course_instance = await selectCourseInstanceById(res.locals.course_instance_id);
    res.locals.urlPrefix = `/pl`;

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
        throw new error.HttpStatusError(404, `Course instance not public.`);
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


router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (req.body.__action === 'copy_course_instance') {

      const courseId = await selectCourseIdByInstanceId(res.locals.course_instance_id);
      res.locals.course = await selectCourseById(courseId);
      res.locals.course_instance = await selectCourseInstanceById(res.locals.course_instance_id);

      console.log('short name', res.locals.course.short_name); // TEST

      console.log('course.id', res.locals.course.id); // TEST

      console.log('Copying course instance'); // TEST

      const editor = new CourseInstanceCopyEditor({
        locals: res.locals,
      });
      
      console.log('after editor') // TEST
      console.log('editor', editor); // TEST

      const serverJob = await editor.prepareServerJob();
      try {
        await editor.executeWithServerJob(serverJob);
      } catch {
        res.redirect(res.locals.urlPrefix + '/edit_error/' + serverJob.jobSequenceId);
        return;
      }

      console.log('serverJob', serverJob); // TEST

      const courseInstanceID = await sqldb.queryRow(
        sql.select_course_instance_id_from_uuid,
        { uuid: editor.uuid, course_id: res.locals.course.id },
        IdSchema,
      );

      console.log('courseInstanceID', courseInstanceID); // TEST

      flash(
        'success',
        'Course instance copied successfully. You are new viewing your copy of the course instance.',
      );
      res.redirect(
        res.locals.plainUrlPrefix +
          '/course_instance/' +
          courseInstanceID +
          '/instructor/instance_admin/settings',
      );
    }
  }),
);

export default router;
