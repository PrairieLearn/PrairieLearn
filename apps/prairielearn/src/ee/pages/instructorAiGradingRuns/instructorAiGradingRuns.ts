import * as express from 'express';
import asyncHandler from 'express-async-handler';

import * as error from '@prairielearn/error';

import { features } from '../../../lib/features/index.js';
import { aiGradeTest } from '../../lib/ai-grading/ai-grading-test.js';
import { aiGrade } from '../../lib/ai-grading.js';

import { InstructorAIGradingRuns } from './instructorAiGradingRuns.html.js';

const router = express.Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_instance_permission_edit) {
      throw new error.HttpStatusError(403, 'Access denied (must be a student data editor)');
    }
    const ai_grading_enabled = await features.enabledFromLocals('ai-grading', res.locals);
    if (!ai_grading_enabled) {
      throw new error.HttpStatusError(403, 'Access denied (feature not available)');
    }
    res.send(InstructorAIGradingRuns({ resLocals: res.locals }));
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (req.body.__action === 'ai_grade_assessment') {
      const ai_grading_enabled = await features.enabledFromLocals('ai-grading', res.locals);
      if (!ai_grading_enabled) {
        throw new error.HttpStatusError(403, 'Access denied (feature not available)');
      }
      const jobSequenceId = await aiGrade({
        question: res.locals.question,
        course: res.locals.course,
        course_instance_id: res.locals.course_instance.id,
        assessment_question: res.locals.assessment_question,
        urlPrefix: res.locals.urlPrefix,
        authn_user_id: res.locals.authn_user.user_id,
        user_id: res.locals.user.user_id,
      });
      res.redirect(res.locals.urlPrefix + '/jobSequence/' + jobSequenceId);
    } else if (req.body.__action === 'ai_grade_assessment_test') {
      const ai_grading_enabled = await features.enabledFromLocals('ai-grading', res.locals);
      if (!ai_grading_enabled) {
        throw new error.HttpStatusError(403, 'Access denied (feature not available)');
      }
      const jobSequenceId = await aiGradeTest({
        question: res.locals.question,
        course: res.locals.course,
        course_instance_id: res.locals.course_instance.id,
        assessment_question: res.locals.assessment_question,
        urlPrefix: res.locals.urlPrefix,
        authn_user_id: res.locals.authn_user.user_id,
        user_id: res.locals.user.user_id,
      });
      res.redirect(res.locals.urlPrefix + '/jobSequence/' + jobSequenceId);
    } else {
      throw new error.HttpStatusError(400, `Unknown action: ${req.body.__action}`);
    }
  }),
);

export default router;
