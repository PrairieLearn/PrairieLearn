import * as express from 'express';
import asyncHandler from 'express-async-handler';
import { OpenAI } from 'openai';

import * as error from '@prairielearn/error';
import { loadSqlEquiv, queryRow, queryRows } from '@prairielearn/postgres';

import { config } from '../../../lib/config.js';
import { setQuestionCopyTargets } from '../../../lib/copy-question.js';
import { getCourseFilesClient } from '../../../lib/course-files-api.js';
import {
  AiGenerationPromptSchema,
  IdSchema,
  type Question,
  QuestionSchema,
} from '../../../lib/db-types.js';
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
import { generateQuestion, regenerateQuestion } from '../../lib/aiQuestionGeneration.js';

import { AiGeneratePage, GenerationFailure } from './instructorAiGenerateQuestion.html.js';

const router = express.Router();

const sql = loadSqlEquiv(import.meta.url);

export async function saveGeneratedQuestion(
  res,
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
    if (req.query?.qid) {
      const qidFull = `__drafts__/${req.query?.qid}`;
      const prompts = await queryRows(
        sql.select_ai_question_generation_prompts,
        { qid: qidFull, course_id: res.locals.course.id.toString() },
        AiGenerationPromptSchema,
      );

      if (prompts && prompts.length > 0) {
        res.locals.question = await queryRow(
          sql.select_question_by_qid_and_course,
          { qid: qidFull, course_id: res.locals.course.id },
          QuestionSchema,
        );
        const variant_id = req.query.variant_id ? IdSchema.parse(req.query.variant_id) : null;

        await getAndRenderVariant(variant_id, null, res.locals);
        await setQuestionCopyTargets(res);
        await logPageView('instructorQuestionPreview', req, res);
        setRendererHeader(res);
      }
      const queryUrl = req.originalUrl.split('?')[1]; //only the info after the query seperator
      res.send(
        AiGeneratePage({
          resLocals: res.locals,
          prompts,
          qid: typeof req.query?.qid == 'string' ? req.query?.qid : undefined,
          queryUrl,
        }),
      );
    } else {
      res.send(
        AiGeneratePage({
          resLocals: res.locals,
        }),
      );
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

    if (req.body.__action === 'generate_question') {
      const result = await generateQuestion({
        client,
        courseId: res.locals.course.id,
        authnUserId: res.locals.authn_user.user_id,
        promptGeneral: req.body.prompt,
        promptUserInput: req.body.prompt_user_input,
        promptGrading: req.body.prompt_grading,
        userId: res.locals.authn_user.user_id,
        hasCoursePermissionEdit: res.locals.authz_data.has_course_permission_edit,
      });

      if (result.htmlResult) {
        res.set({
          'HX-Redirect': `${res.locals.urlPrefix}/ai_generate_question?qid=${result.questionQid.substring(11)}`,
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
    } else if (req.body.__action === 'regenerate_question') {
      const qidFull = `__drafts__/${req.body.unsafe_qid}`;
      const questions: Question[] = await queryRows(
        sql.select_question_by_qid_and_course,
        { qid: qidFull, course_id: res.locals.course.id },
        QuestionSchema,
      );
      if (
        questions.length !== 1 ||
        !questions[0]?.course_id ||
        !idsEqual(questions[0]?.course_id, res.locals.course.id)
      ) {
        throw new error.HttpStatusError(
          403,
          `Draft question with qid ${req.body.unsafe_qid} not found.`,
        );
      }

      const prompts = await queryRows(
        sql.select_ai_question_generation_prompts,
        { qid: qidFull, course_id: res.locals.course.id.toString() },
        AiGenerationPromptSchema,
      );

      const result = await regenerateQuestion(
        client,
        res.locals.course.id,
        res.locals.authn_user.user_id,
        prompts[0]?.user_prompt,
        req.body.prompt,
        prompts[prompts.length - 1].html || '',
        prompts[prompts.length - 1].python || '',
        qidFull,
        res.locals.authn_user.user_id,
        res.locals.authz_data.has_course_permission_edit,
      );

      if (result.htmlResult) {
        res.set({
          'HX-Redirect': `${res.locals.urlPrefix}/ai_generate_question?qid=${req.body.unsafe_qid}`,
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
      const draftQid = `__drafts__/${req.body.unsafe_qid}`;
      const threads = await queryRows(
        sql.select_generation_thread_items,
        { qid: draftQid, course_id: res.locals.course.id.toString() },
        AiGenerationPromptSchema,
      );

      if (threads.length === 0) {
        throw new error.HttpStatusError(403, `Draft question ${req.body.unsafe_qid} not found.`);
      }

      const qid = await saveGeneratedQuestion(
        res,
        threads[threads.length - 1].html || undefined,
        threads[threads.length - 1].python || undefined,
        req.body.title,
        req.body.qid,
      );

      res.redirect(res.locals.urlPrefix + '/question/' + qid + '/settings');
    } else if (req.body.__action === 'grade' || req.body.__action === 'save') {
      res.locals.question = await queryRow(
        sql.select_question_by_qid_and_course,
        { qid: `__drafts__/${req.query.qid}`, course_id: res.locals.course.id },
        QuestionSchema,
      );
      const variantId = await processSubmission(req, res);
      res.redirect(
        `${res.locals.urlPrefix}/ai_generate_question?qid=${req.query?.qid}&variant_id=${variantId}`,
      );
    } else {
      throw new error.HttpStatusError(400, `Unknown action: ${req.body.__action}`);
    }
  }),
);

router.get(
  '/variant/:variant_id(\\d+)/submission/:submission_id(\\d+)',
  asyncHandler(async (req, res) => {
    const { submissionPanel, extraHeadersHtml } = await renderPanelsForSubmission({
      submission_id: req.params.submission_id,
      question_id: res.locals.question.id,
      instance_question_id: null,
      variant_id: req.params.variant_id,
      user_id: res.locals.user.user_id,
      urlPrefix: res.locals.urlPrefix,
      questionContext: 'instructor',
      csrfToken: null,
      authorizedEdit: null,
      renderScorePanels: false,
    });
    res.send({ submissionPanel, extraHeadersHtml });
  }),
);

export default router;
