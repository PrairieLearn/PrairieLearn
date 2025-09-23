import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import * as error from '@prairielearn/error';

import { selectAssessmentQuestions } from '../../models/assessment-question.js';
import { resetVariantsForAssessmentQuestion } from '../../models/variant.js';

import { InstructorAssessmentQuestions } from './instructorAssessmentQuestions.html.js';

const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const questionRows = await selectAssessmentQuestions({
      assessment_id: res.locals.assessment.id,
    });
    res.send(InstructorAssessmentQuestions({ resLocals: res.locals, questionRows }));
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (req.body.__action === 'reset_question_variants') {
      // Block reset variants for Exam assessments
      if (res.locals.assessment.type === 'Exam') {
        throw new error.HttpStatusError(
          400,
          'Reset question variants is not supported for Exam assessments. This can cause instance questions to become unopenable and create inconsistent attempt counts.',
        );
      }
      
      await resetVariantsForAssessmentQuestion({
        assessment_id: res.locals.assessment.id,
        unsafe_assessment_question_id: req.body.unsafe_assessment_question_id,
        authn_user_id: res.locals.authn_user.user_id,
      });
      res.redirect(req.originalUrl);
    } else {
      throw new error.HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;
