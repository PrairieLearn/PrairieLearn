import * as path from 'node:path';
import { Readable } from 'node:stream';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';

import { UI_MESSAGE_STREAM_HEADERS, validateUIMessages } from 'ai';
import { type Response, Router } from 'express';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import { flash } from '@prairielearn/flash';
import { execute, loadSqlEquiv, queryOptionalRow } from '@prairielearn/postgres';
import { run } from '@prairielearn/run';
import { IdSchema } from '@prairielearn/zod';

import { QuestionContainer } from '../../../components/QuestionContainer.js';
import { b64DecodeUnicode, b64EncodeUnicode } from '../../../lib/base64-util.js';
import { config } from '../../../lib/config.js';
import { getCourseFilesClient } from '../../../lib/course-files-api.js';
import {
  AiQuestionGenerationMessageSchema,
  type Course,
  type EnumAiQuestionGenerationMessageStatus,
  type Question,
  type User,
} from '../../../lib/db-types.js';
import { getQuestionFilesData } from '../../../lib/draft-question-files/browser.js';
import {
  EditJobFailedError,
  uploadDraftQuestionFile,
} from '../../../lib/draft-question-files/mutations.js';
import {
  ModifiableQuestionFilePathSchema,
  OptionalSelectedDirectorySchema,
  OptionalSelectedFilePathSchema,
} from '../../../lib/draft-question-files/paths.js';
import { classifyDraftQuestion } from '../../../lib/draft-question-files/question.js';
import { features } from '../../../lib/features/index.js';
import { getAndRenderVariant } from '../../../lib/question-render.js';
import type { ResLocalsQuestionRender } from '../../../lib/question-render.types.js';
import { processSubmission } from '../../../lib/question-submission.js';
import { HttpRedirect } from '../../../lib/redirect.js';
import { type ResLocalsForPage, typedAsyncHandler } from '../../../lib/res-locals.js';
import type { UntypedResLocals } from '../../../lib/res-locals.types.js';
import { validateShortName } from '../../../lib/short-name.js';
import { getUrl } from '../../../lib/url.js';
import { logPageView } from '../../../middlewares/logPageView.js';
import { selectQuestionById } from '../../../models/question.js';
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

function getVariantId(queryValue: unknown) {
  return queryValue == null || queryValue === '' ? null : IdSchema.parse(queryValue);
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
      return message.parts;
    });

    return {
      id: message.id,
      role: message.role,
      parts,
      metadata: {
        job_sequence_id: message.job_sequence_id,
        status: message.status,
        include_in_context: message.include_in_context,
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
  };
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
    'question.html': b64EncodeUnicode(html),
  };

  // We'll delete the `server.py` file if the Python code is empty. Setting
  // it to `null` instructs the editor to delete the file.
  const trimmedPython = python?.trim() ?? '';
  if (trimmedPython !== '') {
    files['server.py'] = b64EncodeUnicode(trimmedPython);
  } else {
    files['server.py'] = null;
  }

  const result = await client.updateQuestionFiles.mutate({
    course_id: course.id,
    user_id: user.id,
    authn_user_id: authn_user.id,
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
    prompting_user_id: authn_user.id,
    prompt_type: promptType,
    user_prompt: prompt,
    system_prompt: prompt,
    response,
    html,
    python,
  });
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

function pipeUiMessageStream(stream: ReadableStream<string>, res: Response) {
  Object.entries(UI_MESSAGE_STREAM_HEADERS).forEach(([key, value]) => {
    res.setHeader(key, value);
  });
  // `Readable.fromWeb` accepts node:stream/web's `ReadableStream`, but the `ai`
  // package returns the global (lib.dom) `ReadableStream`. They are runtime-
  // compatible (Node implements WHATWG streams) but TypeScript treats them as
  // nominally distinct classes, so a cast is required.
  Readable.fromWeb(stream as unknown as NodeReadableStream<string>).pipe(res);
}

router.use(
  typedAsyncHandler<'instructor-question'>(async (req, res, next) => {
    if (!(await features.enabledFromLocals('ai-question-generation', res.locals))) {
      throw new error.HttpStatusError(403, 'Feature not enabled');
    }

    const classified = await classifyDraftQuestion({
      courseId: res.locals.course.id,
      questionId: req.params.question_id,
    });

    if (classified.kind === 'finalized') {
      // The question was finalized; this commonly happens when a user presses
      // the browser back button after finalizing. Send them to the preview.
      res.redirect(`${res.locals.urlPrefix}/question/${classified.question.id}/preview`);
      return;
    }

    if (classified.kind === 'not-found') {
      res.status(404).send(DraftNotFound({ resLocals: res.locals }));
      return;
    }

    res.locals.question = classified.question;

    assertCanCreateQuestion(res.locals);

    next();
  }),
);

router.get(
  '/',
  typedAsyncHandler<'instructor-question', ResLocalsQuestionRender>(async (req, res) => {
    const editorUrl = getEditorUrl(res.locals);
    const [richTextEditorEnabled, messages, questionFilesData] = await Promise.all([
      features.enabledFromLocals('rich-text-editor', res.locals),
      getValidatedInitialMessages(res.locals.question),
      getQuestionFilesData({
        resLocals: res.locals,
        editorUrl,
        selectedFilePath: OptionalSelectedFilePathSchema.parse(req.query.file),
        selectedDirectory: OptionalSelectedDirectorySchema.parse(req.query.dir),
      }),
    ]);

    const { questionContainerHtml } = await renderQuestionPreview(
      res.locals,
      getVariantId(req.query.variant_id),
    );
    await logPageView('instructorQuestionPreview', req, res);

    res.send(
      InstructorAiGenerateDraftEditor({
        resLocals: res.locals,
        question: res.locals.question,
        messages,
        questionFiles: questionFilesData.files,
        fileBrowser: questionFilesData.fileBrowser,
        selectedFile: questionFilesData.selectedFile,
        selectedFilePreview: questionFilesData.selectedFilePreview,
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

    pipeUiMessageStream(stream, res);
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

    pipeUiMessageStream(stream, res);
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

const UploadDraftFileBodySchema = z.object({
  /** When set, replace this exact file (relative to the question root). */
  file_path: z.string().min(1).optional(),
  /** When `file_path` is not set, upload into this directory (relative to the question root). */
  directory: z.string().optional(),
});

router.post(
  '/files',
  typedAsyncHandler<'instructor-question'>(async (req, res) => {
    assertCanCreateQuestion(res.locals);

    if (!req.file) {
      throw new error.HttpStatusError(400, 'No file uploaded');
    }

    const body = UploadDraftFileBodySchema.parse(req.body);
    const requestedPath =
      body.file_path ?? path.posix.join(body.directory ?? '', req.file.originalname);
    const filePath = ModifiableQuestionFilePathSchema.safeParse(requestedPath);
    if (!filePath.success) {
      throw new error.HttpStatusError(
        400,
        filePath.error.issues[0]?.message ?? 'Invalid file path',
      );
    }

    // A failed sync job is reported as a normal response carrying the job id,
    // not an HTTP error — it mirrors the `SYNC_JOB_FAILED` app error the tRPC
    // mutations raise. The client surfaces both the same way.
    try {
      await uploadDraftQuestionFile({
        course: res.locals.course,
        question: res.locals.question,
        user: res.locals.user,
        authn_user: res.locals.authn_user,
        authz_data: res.locals.authz_data,
        filePath: filePath.data,
        fileContents: req.file.buffer,
      });
    } catch (err) {
      if (err instanceof EditJobFailedError) {
        res.json({ jobSequenceId: err.jobSequenceId });
        return;
      }
      throw err;
    }

    res.json({ jobSequenceId: null });
  }),
);

router.post(
  '/',
  typedAsyncHandler<'instructor-question'>(async (req, res) => {
    if (req.body.__action === 'save_question') {
      const client = getCourseFilesClient();

      const result = await client.renameQuestion.mutate({
        course_id: res.locals.course.id,
        user_id: res.locals.user.id,
        authn_user_id: res.locals.authn_user.id,
        has_course_permission_edit: res.locals.authz_data.has_course_permission_edit,
        question_id: res.locals.question.id,
        qid: req.body.qid,
        title: req.body.title,
      });

      if (result.status === 'error') {
        throw new Error('Renaming question failed.');
      }

      // Re-fetch the question in case the QID was changed to avoid conflicts.
      const updatedQuestion = await selectQuestionById(res.locals.question.id);

      flash('success', `Your question is ready for use as ${updatedQuestion.qid}.`);

      res.redirect(res.locals.urlPrefix + '/question/' + res.locals.question.id + '/preview');
    } else if (req.body.__action === 'rename_draft_question') {
      if (req.accepts('html')) {
        throw new error.HttpStatusError(406, 'Not Acceptable');
      }

      const qid =
        typeof req.body.qid === 'string' && req.body.qid.trim() !== ''
          ? req.body.qid
          : res.locals.question.qid;
      const title =
        typeof req.body.title === 'string' && req.body.title.trim() !== ''
          ? req.body.title
          : res.locals.question.title;

      const validation = validateShortName(qid);
      if (!validation.valid) {
        throw new error.HttpStatusError(400, `Invalid QID: ${validation.lowercaseMessage}`);
      }

      const client = getCourseFilesClient();

      const result = await client.renameQuestion.mutate({
        course_id: res.locals.course.id,
        user_id: res.locals.user.id,
        authn_user_id: res.locals.authn_user.id,
        has_course_permission_edit: res.locals.authz_data.has_course_permission_edit,
        question_id: res.locals.question.id,
        qid,
        title,
      });

      if (result.status === 'error') {
        throw new Error('Renaming question failed.');
      }

      const updatedQuestion = await selectQuestionById(res.locals.question.id);
      res.json({ qid: updatedQuestion.qid, title: updatedQuestion.title });
    } else if (req.body.__action === 'submit_manual_revision') {
      await saveRevisedQuestion({
        course: res.locals.course,
        question: res.locals.question,
        user: res.locals.user,
        authn_user: res.locals.authn_user,
        authz_data: res.locals.authz_data,
        urlPrefix: res.locals.urlPrefix,
        html: b64DecodeUnicode(req.body.html),
        python: b64DecodeUnicode(req.body.python),
        prompt: 'Manually update question.',
        promptType: 'manual_change',
      });

      res.redirect(`${res.locals.urlPrefix}/ai_generate_editor/${res.locals.question.id}`);
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
    const preview = await renderQuestionPreview(res.locals, getVariantId(req.query.variant_id));
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
