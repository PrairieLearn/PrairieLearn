import * as express from 'express';
import asyncHandler from 'express-async-handler';
import { OpenAI } from 'openai';

import * as error from '@prairielearn/error';
import { loadSqlEquiv, queryRow } from '@prairielearn/postgres';

import { config } from '../../../lib/config.js';
import { QuestionSchema } from '../../../lib/db-types.js';
import { QuestionAddEditor } from '../../../lib/editors.js';
import { features } from '../../../lib/features/index.js';
import { idsEqual } from '../../../lib/id.js';
import { selectJobsByJobSequenceId } from '../../../lib/server-jobs.js';
import { generateQuestion, regenerateQuestion } from '../../lib/aiQuestionGeneration.js';
import { syncContextDocuments } from '../../lib/contextEmbeddings.js';

import { AiGeneratePage, GenerationResults } from './instructorAiGenerateQuestion.html.js';

const router = express.Router();

const sql = loadSqlEquiv(import.meta.url);

export async function saveGeneratedQuestion(
  res,
  htmlFileContents: string | undefined,
  pythonFileContents: string | undefined,
): Promise<{ qid?: string; redirect?: string }> {
  const files = {};

  if (htmlFileContents) {
    files['question.html'] = htmlFileContents;
  }

  if (pythonFileContents) {
    files['server.py'] = pythonFileContents;
  }

  const editor = new QuestionAddEditor({
    locals: res.locals,
    files,
  });

  const serverJob = await editor.prepareServerJob();

  try {
    await editor.executeWithServerJob(serverJob);
  } catch (err) {
    return { redirect: res.locals.urlPrefix + '/edit_error/' + serverJob.jobSequenceId };
  }

  const result = await queryRow(
    sql.select_added_question,
    { uuid: editor.uuid, course_id: res.locals.course.id.toString() },
    QuestionSchema,
  );

  return { qid: result.id };
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
      const result = await generateQuestion(
        client,
        res.locals.course ? res.locals.course.id : undefined,
        res.locals.authn_user.user_id,
        req.body.prompt,
      );

      const data = result.jobResult;
      if (data) {
        res.send(
          GenerationResults(data.data.html, data.data.python, result.jobSequenceId, res.locals),
        );
      } else {
        throw new error.HttpStatusError(500, `Job sequence ${result.jobSequenceId} failed.`);
      }
    } else if (req.body.__action === 'sync_context_documents') {
      const jobSequenceId = await syncContextDocuments(client, res.locals.authn_user.user_id);
      res.redirect('/pl/jobSequence/' + jobSequenceId);
    } else if (req.body.__action === 'regenerate_question') {
      const genJobs = await selectJobsByJobSequenceId(req.body.unsafe_sequence_job_id);
      if (
        genJobs.length !== 1 ||
        !genJobs[0]?.course_id ||
        !idsEqual(genJobs[0]?.course_id, res.locals.course.id)
      ) {
        throw new error.HttpStatusError(
          403,
          `Job sequence ${req.body.unsafe_sequence_job_id} not found.`,
        );
      }

      const result = await regenerateQuestion(
        client,
        res.locals?.course?.course_id,
        res.locals.authn_user.user_id,
        genJobs[0]?.data?.prompt,
        req.body.prompt,
        genJobs[0]?.data?.html,
        genJobs[0]?.data?.python,
      );

      const data = result.jobResult;
      if (data) {
        res.send(
          GenerationResults(data.data.html, data.data.python, result.jobSequenceId, res.locals),
        );
      } else {
        res.redirect('/pl/jobSequence/' + result.jobSequenceId);
      }
    } else if (req.body.__action === 'save_question') {
      const genJobs = await selectJobsByJobSequenceId(req.body.unsafe_sequence_job_id);
      if (
        genJobs.length !== 1 ||
        !genJobs[0]?.course_id ||
        !idsEqual(genJobs[0]?.course_id, res.locals.course.id)
      ) {
        throw new error.HttpStatusError(
          403,
          `Course for job sequence ${req.body.unsafe_sequence_job_id} does not match the current course.`,
        );
      }

      const result = await saveGeneratedQuestion(
        res,
        genJobs[0]?.data?.html,
        genJobs[0]?.data?.python,
      );

      if (result.qid) {
        res.redirect(res.locals.urlPrefix + '/question/' + result.qid + '/settings');
      } else {
        res.redirect(result.redirect);
      }
    } else {
      throw new error.HttpStatusError(400, `Unknown action: ${req.body.__action}`);
    }
  }),
);

export default router;
