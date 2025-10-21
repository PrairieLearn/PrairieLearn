import { Readable } from 'node:stream';

import { createOpenAI } from '@ai-sdk/openai';
import { UI_MESSAGE_STREAM_HEADERS } from 'ai';
import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import * as error from '@prairielearn/error';
import { flash } from '@prairielearn/flash';
import {
  execute,
  loadSqlEquiv,
  queryOptionalRow,
  queryRow,
  queryRows,
} from '@prairielearn/postgres';

import { QuestionContainer } from '../../../components/QuestionContainer.js';
import * as b64Util from '../../../lib/base64-util.js';
import { config } from '../../../lib/config.js';
import { getCourseFilesClient } from '../../../lib/course-files-api.js';
import {
  AiQuestionGenerationMessageSchema,
  AiQuestionGenerationPromptSchema,
  type Course,
  IdSchema,
  type Question,
  type User,
} from '../../../lib/db-types.js';
import { features } from '../../../lib/features/index.js';
import { idsEqual } from '../../../lib/id.js';
import { getAndRenderVariant } from '../../../lib/question-render.js';
import { processSubmission } from '../../../lib/question-submission.js';
import { HttpRedirect } from '../../../lib/redirect.js';
import { typedAsyncHandler } from '../../../lib/res-locals.js';
import { logPageView } from '../../../middlewares/logPageView.js';
import { selectQuestionById } from '../../../models/question.js';
import { editQuestionWithAgent } from '../../lib/ai-question-generation/agent.js';
import { getAiQuestionGenerationStreamContext } from '../../lib/ai-question-generation/redis.js';

import { InstructorAiGenerateDraftEditor } from './instructorAiGenerateDraftEditor.html.js';

const router = Router({ mergeParams: true });
const sql = loadSqlEquiv(import.meta.url);

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

  await execute(sql.insert_ai_question_generation_prompt, {
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
  typedAsyncHandler<'instance-question'>(async (req, res) => {
    res.locals.question = await selectQuestionById(req.params.question_id);

    // Ensure the question belongs to this course and that it's a draft question.
    if (
      !idsEqual(res.locals.question.course_id, res.locals.course.id) ||
      !res.locals.question.draft
    ) {
      throw new error.HttpStatusError(404, 'Draft question not found');
    }

    assertCanCreateQuestion(res.locals);

    const messages = await queryRows(
      sql.select_ai_question_generation_messages,
      { question_id: req.params.question_id },
      AiQuestionGenerationMessageSchema,
    );

    for (const message of messages) {
      console.dir(message.parts, { depth: null });
    }

    const courseFilesClient = getCourseFilesClient();
    const { files: questionFiles } = await courseFilesClient.getQuestionFiles.query({
      course_id: res.locals.course.id,
      question_id: req.params.question_id,
    });

    const variant_id = req.query.variant_id ? IdSchema.parse(req.query.variant_id) : null;

    const richTextEditorEnabled = await features.enabledFromLocals('rich-text-editor', res.locals);

    // Render the preview.
    await getAndRenderVariant(variant_id, null, res.locals, {
      urlOverrides: {
        // By default, this would be the URL to the instructor question preview page.
        // We need to redirect to this same page instead.
        newVariantUrl: `${res.locals.urlPrefix}/ai_generate_editor/${req.params.question_id}`,
      },
    });
    await logPageView('instructorQuestionPreview', req, res);

    const questionContainerHtml = QuestionContainer({
      resLocals: res.locals,
      questionContext: 'instructor',
    });

    res.send(
      InstructorAiGenerateDraftEditor({
        resLocals: res.locals,
        question: res.locals.question,
        messages,
        questionFiles,
        richTextEditorEnabled,
        questionContainerHtml: questionContainerHtml.toString(),
      }),
    );
  }),
);

// TODO: `instance-question` is probably the wrong type here.
router.get(
  '/chat/stream',
  typedAsyncHandler<'instance-question'>(async (req, res) => {
    res.locals.question = await selectQuestionById(req.params.question_id);

    // Ensure the question belongs to this course and that it's a draft question.
    if (
      !idsEqual(res.locals.question.course_id, res.locals.course.id) ||
      !res.locals.question.draft
    ) {
      throw new error.HttpStatusError(404, 'Draft question not found');
    }

    assertCanCreateQuestion(res.locals);

    const latestMessage = await queryOptionalRow(
      sql.select_latest_ai_question_generation_message,
      { question_id: req.params.question_id },
      AiQuestionGenerationMessageSchema,
    );

    if (!latestMessage) {
      console.log('no latest message');
      res.status(204).send();
      return;
    }
    console.log('latest message found:', latestMessage.id);

    const streamContext = await getAiQuestionGenerationStreamContext();

    const stream = await streamContext.resumeExistingStream(latestMessage.id);
    if (!stream) {
      console.log('stream not found');
      res.status(204).send();
      return;
    }

    console.log('stream found!');
    Object.entries(UI_MESSAGE_STREAM_HEADERS).forEach(([key, value]) => {
      res.setHeader(key, value);
    });
    Readable.fromWeb(stream as any).pipe(res);
  }),
);

router.post(
  '/chat',
  asyncHandler(async (req, res) => {
    if (
      !config.aiQuestionGenerationOpenAiApiKey ||
      !config.aiQuestionGenerationOpenAiOrganization
    ) {
      throw new error.HttpStatusError(403, 'Not implemented (feature not available)');
    }

    const question = await selectQuestionById(req.params.question_id);

    // Ensure the question belongs to this course and that it's a draft question.
    if (!idsEqual(question.course_id, res.locals.course.id) || !question.draft || !question.qid) {
      throw new error.HttpStatusError(404, 'Draft question not found');
    }

    assertCanCreateQuestion(res.locals);

    const openai = createOpenAI({
      apiKey: config.aiQuestionGenerationOpenAiApiKey,
      organization: config.aiQuestionGenerationOpenAiOrganization,
    });

    // TODO: figure out how cost tracking will work here.
    // if (false) {
    //   const intervalCost = await getIntervalUsage({
    //     userId: res.locals.authn_user.user_id,
    //   });

    //   const approxPromptCost = approximatePromptCost({
    //     model: QUESTION_GENERATION_OPENAI_MODEL,
    //     prompt: req.body.prompt,
    //   });

    //   if (intervalCost + approxPromptCost > config.aiQuestionGenerationRateLimitDollars) {
    //     const modelPricing = config.costPerMillionTokens[QUESTION_GENERATION_OPENAI_MODEL];

    //     res.send(
    //       RateLimitExceeded({
    //         // If the user has more than the threshold of 100 tokens,
    //         // they can shorten their message to avoid reaching the rate limit.
    //         canShortenMessage:
    //           config.aiQuestionGenerationRateLimitDollars - intervalCost > modelPricing.input * 100,
    //       }),
    //     );
    //     return;
    //   }
    // }

    const { message } = await editQuestionWithAgent({
      model: openai('gpt-5-mini'),
      course: res.locals.course,
      question,
      user: res.locals.user,
      authnUser: res.locals.authn_user,
      hasCoursePermissionEdit: res.locals.authz_data.has_course_permission_edit,
      messages: req.body.messages,
    });

    const streamContext = await getAiQuestionGenerationStreamContext();

    const stream = await streamContext.resumeExistingStream(message.id);
    if (!stream) {
      res.status(204).send();
      return;
    }

    Object.entries(UI_MESSAGE_STREAM_HEADERS).forEach(([key, value]) => {
      res.setHeader(key, value);
    });
    Readable.fromWeb(stream as any).pipe(res);
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const question = await selectQuestionById(req.params.question_id);

    // Ensure the question belongs to this course and that it's a draft question.
    if (!idsEqual(question.course_id, res.locals.course.id) || !question.draft || !question.qid) {
      throw new error.HttpStatusError(404, 'Draft question not found');
    }

    assertCanCreateQuestion(res.locals);

    if (req.body.__action === 'save_question') {
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

      const client = getCourseFilesClient();

      // TODO: this needs to handle updating the question title as well.
      const result = await client.renameQuestion.mutate({
        course_id: res.locals.course.id,
        user_id: res.locals.user.user_id,
        authn_user_id: res.locals.authn_user.user_id,
        has_course_permission_edit: res.locals.authz_data.has_course_permission_edit,
        question_id: question.id,
        qid: req.body.qid,
      });

      if (result.status === 'error') {
        throw new Error('Renaming question failed.');
      }

      // Re-fetch the question in case the QID was changed to avoid conflicts.
      const updatedQuestion = await selectQuestionById(question.id);

      flash('success', `Your question is ready for use as ${updatedQuestion.qid}.`);

      res.redirect(res.locals.urlPrefix + '/question/' + question.id + '/preview');
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
