import * as express from 'express';
import asyncHandler from 'express-async-handler';
import OpenAI from 'openai';

import * as error from '@prairielearn/error';
import { loadSqlEquiv, queryRows, queryAsync, queryRow } from '@prairielearn/postgres';

import * as b64Util from '../../../lib/base64-util.js';
import { config } from '../../../lib/config.js';
import { setQuestionCopyTargets } from '../../../lib/copy-question.js';
import { getCourseFilesClient } from '../../../lib/course-files-api.js';
import {
  AiQuestionGenerationPromptSchema,
  IdSchema,
  type Course,
  type Question,
  type User,
} from '../../../lib/db-types.js';
import { features } from '../../../lib/features/index.js';
import { idsEqual } from '../../../lib/id.js';
import { getAndRenderVariant, setRendererHeader } from '../../../lib/question-render.js';
import { processSubmission } from '../../../lib/question-submission.js';
import { HttpRedirect } from '../../../lib/redirect.js';
import { logPageView } from '../../../middlewares/logPageView.js';
import { selectQuestionById } from '../../../models/question.js';
import { regenerateQuestion } from '../../lib/aiQuestionGeneration.js';
import { GenerationFailure } from '../instructorAiGenerateDrafts/instructorAiGenerateDrafts.html.js';

import { InstructorAiGenerateDraftEditor } from './instructorAiGenerateDraftEditor.html.js';

const router = express.Router({ mergeParams: true });
const sql = loadSqlEquiv(import.meta.url);

async function saveGeneratedQuestion(
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

async function saveRevisedQuestion({
  course,
  question,
  user,
  authn_user,
  authz_data,
  urlPrefix,
  html,
  python,
  prompt,
  promptType,
}: {
  course: Course;
  question: Question;
  user: User;
  authn_user: User;
  authz_data: {
    has_course_permission_edit: boolean;
  };
  urlPrefix: string;
  html: string;
  python?: string;
  prompt: string;
  promptType: 'manual_change' | 'manual_revert';
}) {
  const client = getCourseFilesClient();

  const files: Record<string, string | null> = {
    'question.html': b64Util.b64EncodeUnicode(html),
  };

  // We'll delete the `server.py` file if the Python code is empty. Setting
  // it to `null` instructs the editor to delete the file.
  const trimmedPython = python?.trim() ?? '';
  if (trimmedPython !== '') {
    files['server.py'] = b64Util.b64EncodeUnicode(trimmedPython);
  } else {
    files['server.py'] = null;
  }

  const result = await client.updateQuestionFiles.mutate({
    course_id: course.id,
    user_id: user.user_id,
    authn_user_id: authn_user.user_id,
    question_id: question.id,
    has_course_permission_edit: authz_data.has_course_permission_edit,
    files,
  });

  if (result.status === 'error') {
    throw new HttpRedirect(urlPrefix + '/edit_error/' + result.job_sequence_id);
  }

  const response = `\`\`\`html\n${html}\`\`\`\n\`\`\`python\n${python}\`\`\``;

  await queryAsync(sql.insert_ai_question_generation_prompt, {
    question_id: question.id,
    prompting_user_id: authn_user.user_id,
    prompt_type: promptType,
    user_prompt: prompt,
    system_prompt: prompt,
    response,
    html,
    python,
  });
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
    res.locals.question = await selectQuestionById(req.params.question_id);

    // Ensure the question belongs to this course and that it's a draft question.
    if (
      !idsEqual(res.locals.question.course_id, res.locals.course.id) ||
      !res.locals.question.draft
    ) {
      throw new error.HttpStatusError(404, 'Draft question not found');
    }

    assertCanCreateQuestion(res.locals);

    const prompts = await queryRows(
      sql.select_ai_question_generation_prompts,
      {
        question_id: req.params.question_id,
        course_id: res.locals.course.id,
      },
      AiQuestionGenerationPromptSchema,
    );

    if (prompts.length === 0) {
      // This is probably a draft question that was created on a different server
      // and thus doesn't have any prompt history. We currently rely on the prompt
      // history to know which HTML and Python to display and adjust, so we can't
      // render this page.
      //
      // TODO: We should pull the HTML and Python off disk instead of relying on
      // the prompt history.
      throw new error.HttpStatusError(404, 'No prompt history found');
    }

    const variant_id = req.query.variant_id ? IdSchema.parse(req.query.variant_id) : null;

    // Render the preview.
    await getAndRenderVariant(variant_id, null, res.locals as any, {
      urlOverrides: {
        // By default, this would be the URL to the instructor question preview page.
        // We need to redirect to this same page instead.
        newVariantUrl: `${res.locals.urlPrefix}/ai_generate_editor/${req.params.question_id}`,
      },
    });
    await setQuestionCopyTargets(res);
    await logPageView('instructorQuestionPreview', req, res);
    setRendererHeader(res);

    res.send(
      InstructorAiGenerateDraftEditor({
        resLocals: res.locals,
        prompts,
        question: res.locals.question,
        variantId: typeof req.query?.variant_id === 'string' ? req.query?.variant_id : undefined,
      }),
    );
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (!config.openAiApiKey || !config.openAiOrganization) {
      throw new error.HttpStatusError(403, 'Not implemented (feature not available)');
    }

    const question = await selectQuestionById(req.params.question_id);

    // Ensure the question belongs to this course and that it's a draft question.
    if (!idsEqual(question.course_id, res.locals.course.id) || !question.draft || !question.qid) {
      throw new error.HttpStatusError(404, 'Draft question not found');
    }

    assertCanCreateQuestion(res.locals);

    const client = new OpenAI({
      apiKey: config.openAiApiKey,
      organization: config.openAiOrganization,
    });

    if (req.body.__action === 'regenerate_question') {
      const prompts = await queryRows(
        sql.select_ai_question_generation_prompts,
        {
          question_id: req.params.question_id,
          course_id: res.locals.course.id,
        },
        AiQuestionGenerationPromptSchema,
      );

      if (prompts.length < 1) {
        throw new error.HttpStatusError(403, 'Prompt history not found.');
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
        {
          question_id: question.id,
          course_id: res.locals.course.id,
        },
        AiQuestionGenerationPromptSchema,
      );

      if (prompts.length === 0) {
        throw new error.HttpStatusError(403, 'Prompt history not found.');
      }

      // TODO: any membership checks needed here?
      const qid = await saveGeneratedQuestion(
        res,
        prompts[prompts.length - 1].html || undefined,
        prompts[prompts.length - 1].python || undefined,
        req.body.title,
        req.body.qid,
      );

      res.redirect(res.locals.urlPrefix + '/question/' + qid + '/settings');
    } else if (req.body.__action === 'submit_manual_revision') {
      await saveRevisedQuestion({
        course: res.locals.course,
        question,
        user: res.locals.user,
        authn_user: res.locals.authn_user,
        authz_data: res.locals.authz_data,
        urlPrefix: res.locals.urlPrefix,
        html: b64Util.b64DecodeUnicode(req.body.html),
        python: b64Util.b64DecodeUnicode(req.body.python),
        prompt: 'Manually update question.',
        promptType: 'manual_change',
      });

      res.redirect(`${res.locals.urlPrefix}/ai_generate_editor/${req.params.question_id}`);
    } else if (req.body.__action === 'revert_edit_version') {
      const prompt = await queryRow(
        sql.select_ai_question_generation_prompt_by_id_and_question,
        { prompt_id: req.body.unsafe_prompt_id, question_id: req.params.question_id },
        AiQuestionGenerationPromptSchema,
      );

      await saveRevisedQuestion({
        course: res.locals.course,
        question,
        user: res.locals.user,
        authn_user: res.locals.authn_user,
        authz_data: res.locals.authz_data,
        urlPrefix: res.locals.urlPrefix,
        html: prompt.html ?? '',
        python: prompt.python ?? undefined,
        prompt: 'Manually revert question to earlier revision.',
        promptType: 'manual_revert',
      });

      res.redirect(`${res.locals.urlPrefix}/ai_generate_editor/${req.params.question_id}`);
    } else if (req.body.__action === 'grade' || req.body.__action === 'save') {
      res.locals.question = question;
      const variantId = await processSubmission(req, res);
      res.redirect(
        `${res.locals.urlPrefix}/ai_generate_editor/${req.params.question_id}?variant_id=${variantId}`,
      );
    } else {
      throw new error.HttpStatusError(400, `Unknown action: ${req.body.__action}`);
    }
  }),
);

export default router;
