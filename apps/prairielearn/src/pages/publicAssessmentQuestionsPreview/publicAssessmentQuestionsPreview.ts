import * as express from 'express';
import asyncHandler from 'express-async-handler';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import { queryRow, loadSqlEquiv } from '@prairielearn/postgres';

import { type Assessment, AssessmentSchema } from '../../lib/db-types.js';
import { selectCourseById, selectCourseIdByInstanceId } from '../../models/course.js';
import { selectCourseInstanceById } from '../../models/course-instances.js';
import { selectAssessmentQuestions } from '../../models/questions.js';

import { InstructorAssessmentQuestions } from './publicAssessmentQuestionsPreview.html.js';
import { setAssessmentCopyTargets } from '../../lib/copy-assessment.js';

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
    res.locals.course_instance = await selectCourseInstanceById(res.locals.course_instance_id);
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


    res.locals.user = res.locals.authn_user; // TEST, need res.locals.user for setAssessmentCopyTargets
    await setAssessmentCopyTargets(res);

    res.send(InstructorAssessmentQuestions({ resLocals: res.locals, questions }));
  }),
);

export default router;
