import * as path from 'path';

import * as express from 'express';
import asyncHandler from 'express-async-handler';
import fs from 'fs-extra';
import klaw from 'klaw';
import { OpenAI } from 'openai';

import * as error from '@prairielearn/error';

import { config } from '../../../lib/config.js';
import { features } from '../../../lib/features/index.js';
import { REPOSITORY_ROOT_PATH } from '../../../lib/paths.js';
import { createServerJob } from '../../../lib/server-jobs.js';
import { generateQuestion } from '../../lib/aiQuestionGeneration.js';
import { buildContextForElementDocs } from '../../lib/context-parsers/documentation.js';
import { buildContextForQuestion } from '../../lib/context-parsers/template-questions.js';
import { openAiUserFromLocals, insertDocumentChunk } from '../../lib/contextEmbeddings.js';

import { AIGeneratePage } from './instructorLlmGenerateQuestion.html.js';

const router = express.Router();

async function syncContextDocuments(client: OpenAI, locals: Record<string, any>) {
  const serverJob = await createServerJob({
    type: 'sync_question_generation_context',
    description: 'Generate embeddings for context documents',
  });

  serverJob.executeInBackground(async (job) => {
    const templateQuestionsPath = path.join(
      REPOSITORY_ROOT_PATH,
      'exampleCourse/questions/template',
    );
    for await (const file of klaw(templateQuestionsPath)) {
      if (file.stats.isDirectory()) continue;

      const filename = path.basename(file.path);
      if (filename !== 'question.html') continue;

      const fileText = await buildContextForQuestion(path.dirname(file.path));
      await insertDocumentChunk(
        client,
        file.path,
        { text: fileText, chunkId: '' },
        job,
        openAiUserFromLocals(locals),
      );
    }

    const elementDocsPath = path.join(REPOSITORY_ROOT_PATH, 'docs/elements.md');
    const fileText = await fs.readFile(elementDocsPath, { encoding: 'utf-8' });
    const files = await buildContextForElementDocs(fileText);
    for (const doc of files) {
      await insertDocumentChunk(client, elementDocsPath, doc, job, openAiUserFromLocals(locals));
    }
  });
  return serverJob.jobSequenceId;
}

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
    if (!(await features.enabledFromLocals('llm-question-generation', res.locals))) {
      throw new error.HttpStatusError(403, 'Feature not enabled');
    }

    next();
  }),
);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    assertCanCreateQuestion(res.locals);

    res.send(AIGeneratePage({ resLocals: res.locals }));
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
      const jobSequenceId = await generateQuestion(client, res.locals, req.body.prompt);
      res.redirect(res.locals.urlPrefix + '/jobSequence/' + jobSequenceId);
    } else if (req.body.__action === 'sync_context_documents') {
      const jobSequenceId = await syncContextDocuments(client, res.locals);
      res.redirect('/pl/jobSequence/' + jobSequenceId);
    } else {
      throw new error.HttpStatusError(400, `Unknown action: ${req.body.__action}`);
    }
  }),
);

export default router;
