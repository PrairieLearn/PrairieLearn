import * as path from 'path';

import sha256 from 'crypto-js/sha256.js';
import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import fs from 'fs-extra';

import * as error from '@prairielearn/error';
import { flash } from '@prairielearn/flash';
import { queryRows, loadSqlEquiv } from '@prairielearn/postgres';

import { PageLayout } from '../../components/PageLayout.html.js';

import { compiledScriptTag } from '../../lib/assets.js';
import { b64EncodeUnicode } from '../../lib/base64-util.js';
import { FileModifyEditor } from '../../lib/editors.js';
import { getPaths } from '../../lib/instructorFiles.js';
import { hydrate } from '../../lib/preact.js';
import { formatJsonWithPrettier } from '../../lib/prettier.js';

import { selectAssessmentQuestions } from '../../models/assessment-question.js';
import { resetVariantsForAssessmentQuestion } from '../../models/variant.js';

import { InstructorAssessmentQuestions } from './instructorAssessmentQuestions.html.js';
import type { I } from 'vitest/dist/chunks/reporters.d.DL9pg5DB.js';
import { ResetQuestionVariantsModal } from './components/ResetQuestionVariantsModal.js';
import csrfToken from '../../middlewares/csrfToken.js';

const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const questions = await selectAssessmentQuestions(res.locals.assessment.id);
    const assessmentPath = path.join(
      res.locals.course.path,
      'courseInstances',
      res.locals.course_instance.short_name,
      'assessments',
      res.locals.assessment.tid,
      'infoAssessment.json',
    );

    const assessmentPathExists = await fs.pathExists(assessmentPath);

    let origHash = '';
    if (assessmentPathExists) {
      origHash = sha256(b64EncodeUnicode(await fs.readFile(assessmentPath, 'utf8'))).toString();
    }
    res.send(
      PageLayout({
        resLocals: res.locals,
        pageTitle: 'Questions',
        headContent: compiledScriptTag('instructorAssessmentQuestionsClient.tsx'),
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
        postContent: hydrate(<ResetQuestionVariantsModal csrfToken={res.locals.__csrf_token} />),
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
