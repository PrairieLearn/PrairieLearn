import * as express from 'express';
import asyncHandler from 'express-async-handler';
import OpenAI from 'openai';

import * as error from '@prairielearn/error';
import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import { config } from '../../../lib/config.js';
import { setQuestionCopyTargets } from '../../../lib/copy-question.js';
import { getCourseFilesClient } from '../../../lib/course-files-api.js';
import { AiGenerationPromptSchema, IdSchema } from '../../../lib/db-types.js';
import { features } from '../../../lib/features/index.js';
import { idsEqual } from '../../../lib/id.js';
import {
  getAndRenderVariant,
  renderPanelsForSubmission,
  setRendererHeader,
} from '../../../lib/question-render.js';
import { processSubmission } from '../../../lib/question-submission.js';
import { HttpRedirect } from '../../../lib/redirect.js';
import { logPageView } from '../../../middlewares/logPageView.js';
import { selectQuestionById } from '../../../models/question.js';
import { regenerateQuestion } from '../../lib/aiQuestionGeneration.js';
import { GenerationFailure } from '../instructorAiGenerateQuestion/instructorAiGenerateQuestion.html.js';

import { AiGenerateEditorPage } from './instructorAiGenerateDraftEditor.html.js';

const router = express.Router();
const sql = loadSqlEquiv(import.meta.url);

export async function saveGeneratedQuestion(
  res: express.Response,
  htmlFileContents: string | undefined,
  pythonFileContents: string | undefined,
  title?: string,
  qid?: string,
): Promise<string> {
  const files = {};

  if (htmlFileContents) {
    files['question.html'] = htmlFileContents;
  }

  if (pythonFileContents) {
    files['server.py'] = pythonFileContents;
  }

  const client = getCourseFilesClient();

  const result = await client.createQuestion.mutate({
    course_id: res.locals.course.id,
    user_id: res.locals.user.user_id,
    authn_user_id: res.locals.authn_user.user_id,
    has_course_permission_edit: res.locals.authz_data.has_course_permission_edit,
    qid,
    title,
    files,
  });

  if (result.status === 'error') {
    throw new HttpRedirect(res.locals.urlPrefix + '/edit_error/' + result.job_sequence_id);
  }

  return result.question_id;
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
    if (res.locals.question_id) {
      const prompts = await queryRows(
        sql.select_ai_question_generation_prompts,
        { question_id: res.locals.question_id, course_id: res.locals.course.id.toString() },
        AiGenerationPromptSchema,
      );

      if (prompts && prompts.length > 0) {
        res.locals.question = await selectQuestionById(res.locals.question_id);
        const variant_id = req.query.variant_id ? IdSchema.parse(req.query.variant_id) : null;

        await getAndRenderVariant(variant_id, null, res.locals);
        await setQuestionCopyTargets(res);
        await logPageView('instructorQuestionPreview', req, res);
        setRendererHeader(res);
      }

      res.send(
        AiGenerateEditorPage({
          resLocals: res.locals,
          prompts,
          question: res.locals.question,
          variantId: req.query?.variant_id,
        }),
      );
    } else {
      //can't find question, redirect to list of all drafts page.
      res.redirect(`${res.locals.urlPrefix}/ai_generate_question_drafts`);
    }
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

    if (req.body.__action === 'regenerate_question') {
      const question = await selectQuestionById(res.locals.question_id);
      if (!idsEqual(question.course_id, res.locals.course.id) || !question.qid) {
        throw new error.HttpStatusError(
          403,
          `Draft question with id ${res.locals.question_id} not found.`,
        );
      }

      const prompts = await queryRows(
        sql.select_ai_question_generation_prompts,
        { question_id: res.locals.question_id, course_id: res.locals.course.id.toString() },
        AiGenerationPromptSchema,
      );

      if (prompts.length < 1) {
        throw new error.HttpStatusError(
          403,
          `Prompts for question ${req.body.unsafe_qid} not found.`,
        );
      }

      const result = await regenerateQuestion(
        client,
        res.locals.course.id,
        res.locals.authn_user.user_id,
        prompts[0]?.user_prompt,
        req.body.prompt,
        prompts[prompts.length - 1].html || '',
        prompts[prompts.length - 1].python || '',
        question.qid,
        res.locals.authn_user.user_id,
        res.locals.authz_data.has_course_permission_edit,
      );

      if (result.htmlResult) {
        res.set({
          'HX-Redirect': `${res.locals.urlPrefix}/ai_generate_editor/${question.id}`,
        });
        res.send();
      } else {
        res.send(
          GenerationFailure({
            urlPrefix: res.locals.urlPrefix,
            jobSequenceId: result.jobSequenceId,
          }),
        );
      }
    } else if (req.body.__action === 'save_question') {
      const prompts = await queryRows(
        sql.select_ai_question_generation_prompts,
        { question_id: res.locals.question_id, course_id: res.locals.course.id.toString() },
        AiGenerationPromptSchema,
      );

      if (prompts.length === 0) {
        throw new error.HttpStatusError(403, `Draft question ${req.body.unsafe_qid} not found.`);
      }

      const qid = await saveGeneratedQuestion(
        res,
        prompts[prompts.length - 1].html || undefined,
        prompts[prompts.length - 1].python || undefined,
        req.body.title,
        req.body.qid,
      );

      res.redirect(res.locals.urlPrefix + '/question/' + qid + '/settings');
    } else if (req.body.__action === 'grade' || req.body.__action === 'save') {
      res.locals.question = await selectQuestionById(res.locals.question_id);
      if (!idsEqual(res.locals.question.course_id, res.locals.course.id)) {
        throw new error.HttpStatusError(
          403,
          `Draft question with id ${res.locals.question_id} not found.`,
        );
      }
      const variantId = await processSubmission(req, res);
      res.redirect(
        `${res.locals.urlPrefix}/ai_generate_editor/${res.locals.question_id}?variant_id=${variantId}`,
      );
    } else {
      throw new error.HttpStatusError(400, `Unknown action: ${req.body.__action}`);
    }
  }),
);

router.get(
  '/variant/:variant_id(\\d+)/submission/:submission_id(\\d+)',
  asyncHandler(async (req, res) => {
    const panels = await renderPanelsForSubmission({
      submission_id: req.params.submission_id,
      question: res.locals.question,
      instance_question: null,
      variant_id: req.params.variant_id,
      user: res.locals.user,
      urlPrefix: res.locals.urlPrefix,
      questionContext: 'instructor',
      // This is only used by score panels, which are not rendered in this context.
      authorizedEdit: false,
      // Score panels are never rendered on this page.
      renderScorePanels: false,
    });
    res.json(panels);
  }),
);
export default router;
