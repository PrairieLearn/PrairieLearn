import * as express from 'express';
import asyncHandler from 'express-async-handler';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import { queryRow, loadSqlEquiv } from '@prairielearn/postgres';

import { selectCourseByCourseInstanceId } from '../../models/course.js';
import { selectAssessmentById } from '../../models/assessment.js';
import { selectAssessmentQuestions } from '../../models/assessment-question.js';

import { InstructorAssessmentQuestions } from './publicAssessmentQuestions.html.js';


async function checkAssessmentPublic(assessment_id: string): Promise<boolean> {
  const isPublic = await queryRow(sql.check_assessment_is_public, { assessment_id }, z.boolean());
  return isPublic;
}

const router = express.Router();
const sql = loadSqlEquiv(import.meta.url);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const isAssessmentPublic = await checkAssessmentPublic(res.locals.assessment_id);    
    if (!isAssessmentPublic) {
      throw new error.HttpStatusError(404, 'Not Found');
    }
    
    const course = await selectCourseByCourseInstanceId(res.locals.course_instance_id.toString());

    if (course.sharing_name === null) {
      throw new error.HttpStatusError(404, 'Not Found');
    }

    res.locals.course = course;
    const assessment = await selectAssessmentById(res.locals.assessment_id); 

    const questions = await selectAssessmentQuestions({
      assessment_id: assessment.id,
      course_id: course.id,
    });

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

    res.send(InstructorAssessmentQuestions({ resLocals: res.locals, assessment, course, questions }));
  }),
);

export default router;
