import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import { HttpStatusError } from '@prairielearn/error';

import { PageLayout } from '../../components/PageLayout.js';
import { selectAssessmentQuestions } from '../../lib/assessment-question.js';
import { compiledScriptTag } from '../../lib/assets.js';
import { resetVariantsForAssessmentQuestion } from '../../models/variant.js';

import { InstructorAssessmentQuestions } from './instructorAssessmentQuestions.html.js';

const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const questionRows = await selectAssessmentQuestions({
      assessment_id: res.locals.assessment.id,
    });
    res.send(
      PageLayout({
        resLocals: res.locals,
        pageTitle: 'Questions',
        headContent: compiledScriptTag('instructorAssessmentQuestionsClient.ts'),
        navContext: {
          type: 'instructor',
          page: 'assessment',
          subPage: 'questions',
        },
        options: {
          fullWidth: true,
        },
        content: InstructorAssessmentQuestions({ resLocals: res.locals, questionRows }),
      }),
    );
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (req.body.__action === 'reset_question_variants') {
      if (res.locals.assessment.type === 'Exam') {
        // See https://github.com/PrairieLearn/PrairieLearn/issues/12977
        throw new HttpStatusError(403, 'Cannot reset variants for Exam assessments');
      }

      await resetVariantsForAssessmentQuestion({
        assessment_id: res.locals.assessment.id,
        unsafe_assessment_question_id: req.body.unsafe_assessment_question_id,
        authn_user_id: res.locals.authn_user.user_id,
      });
      res.redirect(req.originalUrl);
    } else {
      throw new HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;
