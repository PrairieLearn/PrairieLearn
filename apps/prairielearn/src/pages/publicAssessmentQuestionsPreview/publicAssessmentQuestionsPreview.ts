import { AnsiUp } from 'ansi_up';
import * as express from 'express';
import asyncHandler from 'express-async-handler';

import * as error from '@prairielearn/error';
import { flash } from '@prairielearn/flash';
import * as sqldb from '@prairielearn/postgres';
import { queryRow, queryRows, loadSqlEquiv } from '@prairielearn/postgres';

import { Assessment, AssessmentSchema } from '../../lib/db-types.js';
import { AssessmentCopyEditor } from '../../lib/editors.js';
import { IdSchema } from '../../lib/db-types.js';
import { selectCourseById, selectCourseIdByInstanceId } from '../../models/course.js';
import { selectCourseInstanceById } from '../../models/course-instances.js';

import {
  InstructorAssessmentQuestions,
  AssessmentQuestionRowSchema,
} from './publicAssessmentQuestionsPreview.html.js';

import { z } from 'zod';

// Put in assessments.ts? // TEST
async function selectAssessmentById(assessment_id: string): Promise<Assessment> {
  return await queryRow(
    sql.select_assessment_by_id,
    {
      assessment_id,
    },
    AssessmentSchema,
  );
}

const BooleanSchema = z.boolean();

async function checkAssessmentPublic(assessment_id: string): Promise<boolean> {
  const isPublic = await queryRow(
    sql.check_assessment_is_public,
    { assessment_id },
    BooleanSchema,
  );
  return isPublic;
}

async function checkCourseInstancePublic(course_instance_id: string): Promise<boolean> {
  const isPublic = await queryRow(
    sql.check_course_instance_is_public,
    { course_instance_id },
    BooleanSchema,
  );
  return isPublic;
}

const ansiUp = new AnsiUp();
const router = express.Router();
const sql = loadSqlEquiv(import.meta.url);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const isCourseInstancePublic = await checkCourseInstancePublic(res.locals.course_instance_id);
    const isAssessmentPublic = await checkAssessmentPublic(res.locals.assessment_id);
    if (!isCourseInstancePublic && !isAssessmentPublic) {
      throw new error.HttpStatusError(
        404,
        'The course instance that owns this assessment is not public.',
      );
    }

    const courseId = await selectCourseIdByInstanceId(res.locals.course_instance_id.toString());
    const course = await selectCourseById(courseId);



    res.locals.course = course;
    res.locals.urlPrefix = `/pl`;
    res.locals.assessment = await selectAssessmentById(res.locals.assessment_id);
    const questionRows = await queryRows(
      sql.questions,
      {
        assessment_id: res.locals.assessment.id,
        course_id: res.locals.course.id,
      },
      AssessmentQuestionRowSchema,
    );
    const questions = questionRows.map((row) => {
      if (row.sync_errors) row.sync_errors_ansified = ansiUp.ansi_to_html(row.sync_errors);
      if (row.sync_warnings) row.sync_warnings_ansified = ansiUp.ansi_to_html(row.sync_warnings);
      return row;
    });
    res.send(InstructorAssessmentQuestions({ resLocals: res.locals, questions }));
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (req.body.__action === 'copy_assessment') {
      // Get needed data
      const courseId = await selectCourseIdByInstanceId(res.locals.course_instance_id);
      res.locals.course = await selectCourseById(courseId);
      res.locals.course_instance = await selectCourseInstanceById(res.locals.course_instance_id);
      res.locals.assessment = await selectAssessmentById(res.locals.assessment_id);

      res.locals.assessment.sharedPublicly = true; // TEST
      res.locals.user = { id: 'test' }; // TEST
      res.locals.authz_data = { authn_user: { user_id: 'test' } }; // TEST

      const editor = new AssessmentCopyEditor({
        locals: res.locals,
      });

      console.log('before initiating serverJob'); // TEST
      const serverJob = await editor.prepareServerJob();
      console.log('after initiating serverJob', serverJob); // TEST
      try {
        await editor.executeWithServerJob(serverJob);
      } catch {
        res.redirect(res.locals.urlPrefix + '/edit_error/' + serverJob.jobSequenceId);
        return;
      }

      console.log('serverJob', serverJob); // TEST

      /*
      const courseInstanceID = await sqldb.queryRow(
        sql.select_course_instance_id_from_uuid,
        { uuid: editor.uuid, course_id: res.locals.course.id },
        IdSchema,
      );
      

      flash(
        'success',
        'Assessment copied successfully. You are new viewing your copy of the assessment.',
      );
      res.redirect(
        res.locals.plainUrlPrefix +
          '/course_instance/' +
          courseInstanceID +
          '/instructor/instance_admin/settings',
      ); */
    }
  }),
);

export default router;
