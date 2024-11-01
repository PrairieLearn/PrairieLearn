import * as express from 'express';
import asyncHandler from 'express-async-handler';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import { flash } from '@prairielearn/flash';
import { queryRow, loadSqlEquiv } from '@prairielearn/postgres';

import { type Assessment, AssessmentSchema } from '../../lib/db-types.js';
import { AssessmentTransferEditor } from '../../lib/editors.js';
import { selectCourseById, selectCourseIdByInstanceId } from '../../models/course.js';
import { selectCourseInstanceById } from '../../models/course-instances.js';
import { selectAssessmentQuestions } from '../../models/questions.js';

import { InstructorAssessmentQuestions } from './publicAssessmentQuestionsPreview.html.js';

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
  const isPublic = await queryRow(sql.check_assessment_is_public, { assessment_id }, BooleanSchema);
  return isPublic;
}

const router = express.Router();
const sql = loadSqlEquiv(import.meta.url);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const isAssessmentPublic = await checkAssessmentPublic(res.locals.assessment_id);
    const courseId = await selectCourseIdByInstanceId(res.locals.course_instance_id.toString());
    const course = await selectCourseById(courseId);

    if (!isAssessmentPublic) {
      throw new error.HttpStatusError(404, 'Not Found');
    }

    res.locals.course = course;
    res.locals.assessment = await selectAssessmentById(res.locals.assessment_id);
    const questions = await selectAssessmentQuestions(res.locals.assessment_id, courseId);

    // Filter out non-public assessments
    const isOtherAssessmentPublic = {};
    for (const question of questions) {
      for (const assessment of question.other_assessments || []) {
        isOtherAssessmentPublic[assessment.assessment_id] = false;
      }
    }
    for (const id in isOtherAssessmentPublic) {
      isOtherAssessmentPublic[id] = await checkAssessmentPublic(id);
    }
    for (const question of questions) {
      question.other_assessments =
        question.other_assessments?.filter(
          (assessment) => isOtherAssessmentPublic[assessment.assessment_id],
        ) ?? [];
    }

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

      // TEST: Ensure authz_data is included
      const authz_data = res.locals.authz_data || {};

      console.log('res.locals', res.locals); // TEST

      console.log('authz_data', authz_data); // TEST

      // Create an instance of AssessmentTransferEditor
      const editor = new AssessmentTransferEditor({
        from_aid: res.locals.assessment.id,
        from_course_short_name: res.locals.course.short_name,
        from_path: res.locals.assessment.path,
        course: res.locals.course,
        authz_data, // TEST
      });

      try {
        // Execute the write method
        const result = await editor.write();

        // Flash success message and redirect
        flash('success', 'Assessment copied successfully.');
        res.redirect(res.locals.plainUrlPrefix + '/course_instance/' + res.locals.course_instance_id + '/instructor/instance_admin/settings');
      } catch (error) {
        // Handle error and redirect to error page
        res.redirect(res.locals.urlPrefix + '/edit_error/' + error.message);
      }














      // TEST BELOW
      // const editor = new AssessmentCopyEditor({
      //   locals: res.locals,
      // });

      // console.log('before initiating serverJob'); // TEST
      // const serverJob = await editor.prepareServerJob();
      // console.log('after initiating serverJob', serverJob); // TEST
      // try {
      //   await editor.executeWithServerJob(serverJob);
      // } catch {
      //   res.redirect(res.locals.urlPrefix + '/edit_error/' + serverJob.jobSequenceId);
      //   return;
      // }

      // console.log('serverJob', serverJob); // TEST

      // /*
      // const courseInstanceID = await sqldb.queryRow(
      //   sql.select_course_instance_id_from_uuid,
      //   { uuid: editor.uuid, course_id: res.locals.course.id },
      //   IdSchema,
      // );
      

      // flash(
      //   'success',
      //   'Assessment copied successfully. You are new viewing your copy of the assessment.',
      // );
      // res.redirect(
      //   res.locals.plainUrlPrefix +
      //     '/course_instance/' +
      //     courseInstanceID +
      //     '/instructor/instance_admin/settings',
      // ); */
    }
  }),
);




export default router;
