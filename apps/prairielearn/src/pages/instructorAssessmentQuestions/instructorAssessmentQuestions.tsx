import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import * as error from '@prairielearn/error';

import { PageLayout } from '../../components/PageLayout.html.js';
import { compiledScriptTag } from '../../lib/assets.js';
import { hydrate } from '../../lib/preact.js';
import { selectAssessmentQuestions } from '../../models/assessment-question.js';
import { resetVariantsForAssessmentQuestion } from '../../models/variant.js';

import { InstructorAssessmentQuestions } from './instructorAssessmentQuestions.html.js';

const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const questions = await selectAssessmentQuestions(res.locals.assessment.id);
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
        content: hydrate(
          <InstructorAssessmentQuestions resLocals={res.locals} questions={questions} />,
        ),
      }),
    );
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (req.body.__action === 'reset_question_variants') {
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
