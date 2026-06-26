import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';

import { UI_MESSAGE_STREAM_HEADERS, validateUIMessages } from 'ai';
import { type Request, type Response, Router } from 'express';

import * as error from '@prairielearn/error';
import { flash } from '@prairielearn/flash';
import { execute, loadSqlEquiv, queryOptionalRow } from '@prairielearn/postgres';
import { run } from '@prairielearn/run';
import { IdSchema } from '@prairielearn/zod';

import { QuestionContainer } from '../../../components/QuestionContainer.js';
import { config } from '../../../lib/config.js';
import {
  AiQuestionGenerationMessageSchema,
  type EnumAiQuestionGenerationMessageStatus,
  type Question,
} from '../../../lib/db-types.js';
import {
  browseDraftQuestionFiles,
  getDraftQuestionFileContents,
} from '../../../lib/draft-question-files/browser.js';
import { renameDraftQuestion } from '../../../lib/draft-question-files/mutations.js';
import { parseSelectionQueryParam } from '../../../lib/draft-question-files/selection.js';
import { classifyDraftQuestion } from '../../../lib/draft-question.ts';
import { features } from '../../../lib/features/index.js';
import { getAndRenderVariant } from '../../../lib/question-render.js';
import type { ResLocalsQuestionRender } from '../../../lib/question-render.types.js';
import { processSubmission } from '../../../lib/question-submission.js';
import { type ResLocalsForPage, typedAsyncHandler } from '../../../lib/res-locals.js';
import type { UntypedResLocals } from '../../../lib/res-locals.types.js';
import { getUrl } from '../../../lib/url.js';
import { logPageView } from '../../../middlewares/logPageView.js';
import { selectOptionalQuestionById } from '../../../models/question.js';
import {
  type QuestionGenerationUIMessage,
  editQuestionWithAgent,
  getAgenticModel,
} from '../../lib/ai-question-generation/agent.js';
import { getAiQuestionGenerationStreamContext } from '../../lib/ai-question-generation/redis.js';
import { getIntervalUsage } from '../../lib/aiQuestionGeneration.js';
import { selectAiQuestionGenerationMessages } from '../../models/ai-question-generation-message.js';

import {
  DraftNotFound,
  InstructorAiGenerateDraftEditor,
} from './instructorAiGenerateDraftEditor.html.js';

const router = Router({ mergeParams: true });
const sql = loadSqlEquiv(import.meta.url);

type InstructorQuestionLocals = ResLocalsForPage<'instructor-question'>;
type InstructorQuestionRenderLocals = InstructorQuestionLocals & ResLocalsQuestionRender;

function getEditorUrl(resLocals: InstructorQuestionLocals) {
  return `${resLocals.urlPrefix}/ai_generate_editor/${resLocals.question.id}`;
}

function getVariantId(req: Request) {
  const id = req.query.variant_id;
  if (id == null || id === '') return null;
  if (typeof id !== 'string') {
    throw new error.HttpStatusError(400, 'Invalid variant_id');
  }

  const result = IdSchema.safeParse(id);
  if (!result.success) {
    throw new error.HttpStatusError(400, 'Invalid variant_id');
  }
  return result.data;
}

async function getValidatedInitialMessages(question: Question) {
  const messages = await selectAiQuestionGenerationMessages(question);

  const initialMessages = messages.map((message): QuestionGenerationUIMessage => {
    // Messages without parts will fail validation by `validateUIMessages()`.
    // We'll inject an empty text part in that case.
    //
    // This is not expected to happen in most cases, but there's a possibility
    // that it could in an error scenario.
    const parts = run(() => {
      if (message.parts.length === 0) {
        return [{ type: 'text', text: '' }];
      }
      // Tool calls whose tool returned nothing (e.g. legacy `writeFile`) were
      // persisted without an `output` field. Zod 4's `validateUIMessages()`
      // rejects an `output-available` tool part that lacks `output`, so
      // backfill a null output for these older parts.
      //
      // TODO: see the following issue and PR. If they're ever resolved,
      // we can consider removing this workaround. Specifically, we'll need
      // the AI SDK to be able to gracefully handle message parts that were
      // persisted without an explicit `output` property.
      //
      // https://github.com/vercel/ai/issues/15854
      // https://github.com/vercel/ai/pull/15855
      return message.parts.map((part) =>
        part?.state === 'output-available' && !('output' in part)
          ? { ...part, output: null }
          : part,
      );
    });

    return {
      id: message.id,
      role: message.role,
      parts,
      metadata: {
        job_sequence_id: message.job_sequence_id,
        status: message.status,
        include_in_context: message.include_in_context,
        user_name: message.user_name,
        created_at: message.created_at.toISOString(),
      },
    };
  });

  // `validateUIMessages()` won't validate an empty array; we'll skip validation in that case.
  //
  // TODO: we're currently lying to the compiler here. We should be passing schemas
  // for our metadata and tools.
  return initialMessages.length > 0
    ? await validateUIMessages<QuestionGenerationUIMessage>({
        messages: initialMessages,
      })
    : [];
}

async function renderQuestionPreview(
  resLocals: InstructorQuestionRenderLocals,
  variantId: string | null,
) {
  await getAndRenderVariant(variantId, null, resLocals, {
    urlOverrides: {
      newVariantUrl: getEditorUrl(resLocals),
    },
  });

  return {
    questionContainerHtml: QuestionContainer({
      resLocals,
      questionContext: 'instructor',
    }).toString(),
    extraHeadersHtml: resLocals.extraHeadersHtml,
    variantId: resLocals.variant.id,
  };
}

function assertCanCreateQuestion(resLocals: UntypedResLocals) {
  // Do not allow users to edit without permission
  if (!resLocals.authz_data.has_course_permission_edit) {
    throw new error.HttpStatusError(403, 'Access denied (must be course editor)');
  }

  // Do not allow users to edit the exampleCourse
  if (resLocals.course.example_course) {
    throw new error.HttpStatusError(403, 'Access denied (cannot edit the example course)');
  }
}

async function pipeUiMessageStream(stream: ReadableStream<string>, res: Response) {
  Object.entries(UI_MESSAGE_STREAM_HEADERS).forEach(([key, value]) => {
    res.setHeader(key, value);
  });

  // `Readable.fromWeb` accepts node:stream/web's `ReadableStream`, but the `ai`
  // package returns the global (lib.dom) `ReadableStream`. They are runtime-
  // compatible (Node implements WHATWG streams) but TypeScript treats them as
  // nominally distinct classes, so a cast is required.
  await pipeline(Readable.fromWeb(stream as unknown as NodeReadableStream<string>), res);
}

router.use(
  typedAsyncHandler<'instructor-question'>(async (req, res, next) => {
    if (!(await features.enabledFromLocals('ai-question-generation', res.locals))) {
      throw new error.HttpStatusError(403, 'Feature not enabled');
    }

    const question = await selectOptionalQuestionById(req.params.question_id);
    const classification = classifyDraftQuestion(res.locals.course, question);

    if (classification.kind === 'not-found') {
      res.status(404).send(DraftNotFound({ resLocals: res.locals }));
      return;
    }

    if (classification.kind === 'finalized') {
      // If the question was already finalized, redirect to the question preview.
      // This handles the common case of a user pressing the browser back button
      // after finalizing a question.
      res.redirect(`${res.locals.urlPrefix}/question/${classification.question.id}/preview`);
      return;
    }

    res.locals.question = classification.question;

    assertCanCreateQuestion(res.locals);

    next();
  }),
);

router.get(
  '/',
  typedAsyncHandler<'instructor-question', ResLocalsQuestionRender>(async (req, res) => {
    const [richTextEditorEnabled, messages, fileContents, browseData] = await Promise.all([
      features.enabledFromLocals('rich-text-editor', res.locals),
      getValidatedInitialMessages(res.locals.question),
      getDraftQuestionFileContents({
        courseId: res.locals.course.id,
        questionId: res.locals.question.id,
      }),
      browseDraftQuestionFiles({
        resLocals: res.locals,
        selection: parseSelectionQueryParam(req.query.selection),
      }),
    ]);

    const { questionContainerHtml } = await renderQuestionPreview(res.locals, getVariantId(req));
    await logPageView('instructorQuestionPreview', req, res);

    res.send(
      InstructorAiGenerateDraftEditor({
        resLocals: res.locals,
        question: res.locals.question,
        messages,
        fileContents,
        browseData,
        richTextEditorEnabled,
        questionContainerHtml,
        search: getUrl(req).search,
      }),
    );
  }),
);

router.get(
  '/chat/stream',
  typedAsyncHandler<'instructor-question'>(async (req, res) => {
    const latestMessage = await queryOptionalRow(
      sql.select_latest_ai_question_generation_message,
      { question_id: res.locals.question.id },
      AiQuestionGenerationMessageSchema,
    );

    const finishedStatuses: EnumAiQuestionGenerationMessageStatus[] = [
      'completed',
      'errored',
      'canceled',
    ] as const;
    if (!latestMessage || finishedStatuses.includes(latestMessage.status)) {
      res.status(204).send();
      return;
    }

    const streamContext = await getAiQuestionGenerationStreamContext();

    const stream = await streamContext.resumeExistingStream(latestMessage.id);
    if (!stream) {
      res.status(204).send();
      return;
    }

    await pipeUiMessageStream(stream, res);
  }),
);

router.post(
  '/chat',
  typedAsyncHandler<'instructor-question'>(async (req, res) => {
    if (
      !config.aiQuestionGenerationOpenAiApiKey ||
      !config.aiQuestionGenerationOpenAiOrganization
    ) {
      throw new error.HttpStatusError(403, 'Not implemented (feature not available)');
    }

    assertCanCreateQuestion(res.locals);

    const intervalCost = await getIntervalUsage(res.locals.authn_user);

    if (intervalCost > config.aiQuestionGenerationRateLimitDollars) {
      res.status(429).send();
      return;
    }

    const { model, modelId } = getAgenticModel();
    const messageParts = req.body.message?.parts;
    if (!messageParts) {
      throw new error.HttpStatusError(400, 'No message parts provided');
    }
    const { message } = await editQuestionWithAgent({
      model,
      modelId,
      course: res.locals.course,
      question: res.locals.question,
      user: res.locals.user,
      authnUser: res.locals.authn_user,
      hasCoursePermissionEdit: res.locals.authz_data.has_course_permission_edit,
      userMessageParts: messageParts,
    });

    const streamContext = await getAiQuestionGenerationStreamContext();

    const stream = await streamContext.resumeExistingStream(message.id);
    if (!stream) {
      res.status(204).send();
      return;
    }

    await pipeUiMessageStream(stream, res);
  }),
);

router.post(
  '/chat/cancel',
  typedAsyncHandler<'instructor-question'>(async (req, res) => {
    assertCanCreateQuestion(res.locals);

    await execute(sql.cancel_latest_streaming_message, {
      question_id: res.locals.question.id,
    });

    res.status(200).json({ success: true });
  }),
);

router.post(
  '/',
  typedAsyncHandler<'instructor-question'>(async (req, res) => {
    if (req.body.__action === 'save_question') {
      const updatedQuestion = await renameDraftQuestion({
        course: res.locals.course,
        question: res.locals.question,
        user: res.locals.user,
        authz_data: res.locals.authz_data,
        qid: req.body.qid,
        title: req.body.title,
      });

      flash('success', `Your question is ready for use as ${updatedQuestion.qid}.`);

      res.redirect(`${res.locals.urlPrefix}/question/${res.locals.question.id}/preview`);
    } else if (req.body.__action === 'grade' || req.body.__action === 'save') {
      const variantId = await processSubmission(req, res);
      res.redirect(
        `${res.locals.urlPrefix}/ai_generate_editor/${res.locals.question.id}?variant_id=${variantId}`,
      );
    } else {
      throw new error.HttpStatusError(400, `Unknown action: ${req.body.__action}`);
    }
  }),
);

router.get(
  '/variant',
  typedAsyncHandler<'instructor-question', ResLocalsQuestionRender>(async (req, res) => {
    const preview = await renderQuestionPreview(res.locals, getVariantId(req));
    await logPageView('instructorQuestionPreview', req, res);

    res.json(preview);
  }),
);

router.post(
  '/variant',
  typedAsyncHandler<'instructor-question', ResLocalsQuestionRender>(async (req, res) => {
    if (req.body.__action === 'grade' || req.body.__action === 'save') {
      const variantId = await processSubmission(req, res);
      res.json(await renderQuestionPreview(res.locals, variantId));
    } else {
      throw new error.HttpStatusError(400, `Unknown action: ${req.body.__action}`);
    }
  }),
);

export default router;
