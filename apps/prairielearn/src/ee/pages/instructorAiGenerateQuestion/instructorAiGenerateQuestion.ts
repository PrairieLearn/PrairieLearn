
import * as express from 'express';
import asyncHandler from 'express-async-handler';
import { OpenAI } from 'openai';

import * as error from '@prairielearn/error';

import { config } from '../../../lib/config.js';
import { features } from '../../../lib/features/index.js';
import { generateQuestion } from '../../lib/aiQuestionGeneration.js';

import { AiGeneratePage } from './instructorAiGenerateQuestion.html.js';
import { syncContextDocuments } from '../../lib/contextEmbeddings.js';

const router = express.Router();

function assertCanCreateQuestion(resLocals: Record<string, any>) {
  // Do not allow users to edit without permission
  if (!resLocals.authz_data.has_course_permission_edit) {
    throw new error.HttpStatusError(403, 'Access denied (must be course editor)');
  }

  // Do not allow users to edit the exampleCourse
  if (resLocals.course.example_course) {
    throw new error.HttpStatusError(403, 'Access denied (cannot edit the example course)');
  }
}

router.use(
  asyncHandler(async (req, res, next) => {
    if (!(await features.enabledFromLocals('ai-question-generation', res.locals))) {
      throw new error.HttpStatusError(403, 'Feature not enabled');
    }

    next();
  }),
);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    assertCanCreateQuestion(res.locals);

    res.send(AiGeneratePage({ resLocals: res.locals }));
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    assertCanCreateQuestion(res.locals);

    if (!config.openAiApiKey || !config.openAiOrganization) {
      throw new error.HttpStatusError(403, 'Not implemented (feature not available)');
    }
    const client = new OpenAI({
      apiKey: config.openAiApiKey,
      organization: config.openAiOrganization,
    });

    if (req.body.__action === 'generate_question') {
      const jobSequenceId = await generateQuestion(client, res.locals.course? res.locals.course_id : undefined, res.locals.authn_user.user_id, req.body.prompt);
      res.redirect(res.locals.urlPrefix + '/jobSequence/' + jobSequenceId);
    } else if (req.body.__action === 'sync_context_documents') {
      const jobSequenceId = await syncContextDocuments(client, res.locals.authn_user.user_id);
      res.redirect('/pl/jobSequence/' + jobSequenceId);
    } else {
      throw new error.HttpStatusError(400, `Unknown action: ${req.body.__action}`);
    }
  }),
);

export default router;
