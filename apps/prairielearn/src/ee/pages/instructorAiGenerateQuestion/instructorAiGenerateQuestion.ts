import * as express from 'express';
import asyncHandler from 'express-async-handler';
import { OpenAI } from 'openai';

import * as error from '@prairielearn/error';
import { loadSqlEquiv, queryRow, queryRows } from '@prairielearn/postgres';

import { config } from '../../../lib/config.js';
import { setQuestionCopyTargets } from '../../../lib/copy-question.js';
import { getCourseFilesClient } from '../../../lib/course-files-api.js';
import { AiGenerationPromptSchema, type Question, QuestionSchema } from '../../../lib/db-types.js';
import { QuestionDeleteEditor } from '../../../lib/editors.js';
import { features } from '../../../lib/features/index.js';
import { idsEqual } from '../../../lib/id.js';
import { getAndRenderVariant, setRendererHeader } from '../../../lib/question-render.js';
import { HttpRedirect } from '../../../lib/redirect.js';
import { selectJobsByJobSequenceId } from '../../../lib/server-jobs.js';
import { generateQuestion, regenerateQuestion } from '../../lib/aiQuestionGeneration.js';

import {
  AiGeneratePage,
  GenerationFailure,
  GenerationResults,
} from './instructorAiGenerateQuestion.html.js';

const router = express.Router();

const sql = loadSqlEquiv(import.meta.url);

export async function saveGeneratedQuestion(
  res,
  htmlFileContents: string | undefined,
  pythonFileContents: string | undefined,
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
      const threads = await queryRows(
        sql.select_generation_thread_items,
        { course_id: res.locals.course.id.toString() },
        AiGenerationPromptSchema,
      );
      console.log(threads);

      if (threads && threads.length > 0) {
        res.locals.question = await queryRow(
          sql.select_question_by_qid_and_course,
          { qid: qidFull, course_id: res.locals.course.id },
          QuestionSchema,
        );
        await getAndRenderVariant(null, null, res.locals);
        await setQuestionCopyTargets(res);
        setRendererHeader(res);
      }
      res.send(
        AiGeneratePage({
          resLocals: res.locals,
          threads,
          qid: typeof req.query?.qid == 'string' ? req.query?.qid : undefined,
        }),
      );
    } else {
      res.send(AiGeneratePage({ resLocals: res.locals }));
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
      console.log("a")
      const result = await generateQuestion({
        client,
        courseId: res.locals.course.id,
        authnUserId: res.locals.authn_user.user_id,
        promptGeneral: req.body.prompt,
        promptUserInput: req.body.prompt_user_input,
        promptGrading: req.body.prompt_grading,
        userId: res.locals.user.user_id,
        hasCoursePermissionEdit: res.locals.authz_data.has_course_permission_edit,
      });

      console.log(result);

      if (result.htmlResult) {
        res.set({
          'HX-Redirect': `${res.locals.urlPrefix}/ai_generate_question?qid=${result.questionQid.substring(11)}`,
        });
        res.send(
          GenerationResults(
            result.htmlResult,
            result.pythonResult,
            result.jobSequenceId,
            res.locals,
          ),
        );
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
          `Question ${req.body.unsafe_sequence_job_id} not found.`,
        );
      }

      const threads = await queryRows(
        sql.select_generation_thread_items,
        { qid: qidFull, course_id: res.locals.course.id.toString() },
        AiGenerationPromptSchema,
      );

      const result = await regenerateQuestion(
        client,
        res.locals.course.id,
        res.locals.authn_user.user_id,
        threads[0].user_prompt,
        req.body.prompt,
        threads[threads.length - 1].html || '',
        threads[threads.length - 1].python || '',
        req.body.unsafe_qid,
        res.locals.user.user_id,
        res.locals.authz_data.has_course_permission_edit,
      );

      if (result.htmlResult) {
        res.set({
          'HX-Redirect': `${res.locals.urlPrefix}/ai_generate_question?qid=${req.body.unsafe_qid}`,
        });

        res.send(
          GenerationResults(
            result.htmlResult,
            result.pythonResult,
            result.jobSequenceId,
            res.locals,
          ),
        );
      } else {
        res.send(
          GenerationFailure({
            urlPrefix: res.locals.urlPrefix,
            jobSequenceId: result.jobSequenceId,
          }),
        );
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
          `Job sequence ${req.body.unsafe_sequence_job_id} not found.`,
        );
      }

      const qid = await saveGeneratedQuestion(
        res,
        genJobs[0]?.data?.html,
        genJobs[0]?.data?.python,
      );

      res.redirect(res.locals.urlPrefix + '/question/' + qid + '/settings');
    } else if (req.body.__action === 'delete_drafts') {
      const questions = await queryRows(
        sql.select_all_drafts,
        { course_id: res.locals.course.id.toString() },
        QuestionSchema,
      );

      for (const question of questions) {
        const locals = res.locals;
        locals['question'] = question;
        const editor = new QuestionDeleteEditor({ locals });
        const serverJob = await editor.prepareServerJob();
        await editor.executeWithServerJob(serverJob);
      }
      res.send(AiGeneratePage({ resLocals: res.locals }));
    } else {
      throw new error.HttpStatusError(400, `Unknown action: ${req.body.__action}`);
    }
  }),
);

export default router;
