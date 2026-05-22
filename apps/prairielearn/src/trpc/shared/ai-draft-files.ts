import { TRPCError, initTRPC } from '@trpc/server';
import superjson from 'superjson';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import { IdSchema } from '@prairielearn/zod';

import { b64DecodeUnicode } from '../../lib/base64-util.js';
import {
  type DraftQuestionFilesLocals,
  deleteDraftQuestionFile,
  getQuestionFilesData,
  getSelectedQuestionDirectory,
  getSelectedQuestionFilePath,
  normalizeQuestionFilePath,
  renameDraftQuestionFile,
  saveDraftQuestionFile,
} from '../../lib/draft-question-files.js';
import { features } from '../../lib/features/index.js';
import { idsEqual } from '../../lib/id.js';
import { selectOptionalQuestionById } from '../../models/question.js';
import { appErrorFormatter } from '../app-errors.js';

export interface AiDraftFilesError {
  List: never;
  Save: never;
  Rename: never;
  Delete: never;
}

const ListInputSchema = z.object({
  questionId: IdSchema,
  selectedFilePath: z.string().nullable(),
  selectedDirectory: z.string().nullable(),
});

const SaveInputSchema = z.object({
  questionId: IdSchema,
  filePath: z.string(),
  encodedContents: z.string(),
});

const RenameInputSchema = z.object({
  questionId: IdSchema,
  oldFilePath: z.string(),
  newFilePath: z.string(),
});

const DeleteInputSchema = z.object({
  questionId: IdSchema,
  filePath: z.string(),
});

async function selectDraftQuestionOrThrow({
  courseId,
  questionId,
}: {
  courseId: string;
  questionId: string;
}) {
  const question = await selectOptionalQuestionById(questionId);
  if (
    question == null ||
    !idsEqual(question.course_id, courseId) ||
    question.deleted_at != null ||
    !question.draft
  ) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Draft question not found',
    });
  }
  return question;
}

/**
 * The `aiDraftFiles` router is mounted in both the `course` and `courseInstance`
 * tRPC trees. It only needs course-level context, so it defines its own tRPC
 * instance with a minimal context that both trees satisfy. Nesting this single
 * router into both trees guarantees the two mounts can never drift apart and
 * share one accurate client-side router type.
 */
interface AiDraftFilesContext {
  course: { id: string; example_course: boolean };
  authz_data: { has_course_permission_edit: boolean };
  locals: Omit<DraftQuestionFilesLocals, 'question'>;
}

const t = initTRPC.context<AiDraftFilesContext>().create({
  transformer: superjson,
  errorFormatter: appErrorFormatter,
});

const requireCoursePermissionEdit = t.middleware(async (opts) => {
  if (!opts.ctx.authz_data.has_course_permission_edit) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Access denied (must be a course editor)',
    });
  }
  return opts.next();
});

const requireNotExampleCourse = t.middleware(async (opts) => {
  if (opts.ctx.course.example_course) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Access denied. Cannot make changes to example course.',
    });
  }
  return opts.next();
});

const requireAiQuestionGenerationEnabled = t.middleware(async (opts) => {
  if (!(await features.enabledFromLocals('ai-question-generation', opts.ctx.locals))) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Feature not enabled',
    });
  }
  return opts.next();
});

/**
 * Translates `HttpStatusError`s thrown by the shared draft-question-files lib
 * into `TRPCError`s. Without this, a raw `HttpStatusError` would surface as a
 * generic 500, since `appErrorFormatter` only understands tRPC's own errors.
 */
const translateHttpStatusErrors = t.middleware(async (opts) => {
  const result = await opts.next();
  if (!result.ok && result.error.cause instanceof error.HttpStatusError) {
    const httpError = result.error.cause;
    throw new TRPCError({
      code:
        httpError.status === 404
          ? 'NOT_FOUND'
          : httpError.status === 403
            ? 'FORBIDDEN'
            : 'BAD_REQUEST',
      message: httpError.message,
    });
  }
  return result;
});

/** Resolves the draft question named by the request's `questionId` onto `ctx`. */
const resolveDraftQuestion = t.middleware(async (opts) => {
  const { questionId } = z.object({ questionId: IdSchema }).parse(await opts.getRawInput());
  const question = await selectDraftQuestionOrThrow({
    courseId: opts.ctx.course.id,
    questionId,
  });
  return opts.next({ ctx: { question } });
});

const aiDraftFilesProcedure = t.procedure
  .use(requireCoursePermissionEdit)
  .use(requireNotExampleCourse)
  .use(requireAiQuestionGenerationEnabled)
  .use(translateHttpStatusErrors)
  .use(resolveDraftQuestion);

export const aiDraftFilesRouter = t.router({
  list: aiDraftFilesProcedure.input(ListInputSchema).query(async ({ ctx, input }) => {
    return await getQuestionFilesData({
      resLocals: { ...ctx.locals, question: ctx.question },
      editorUrl: `${ctx.locals.urlPrefix}/ai_generate_editor/${ctx.question.id}`,
      selectedFilePath: getSelectedQuestionFilePath(input.selectedFilePath),
      selectedDirectory: getSelectedQuestionDirectory(input.selectedDirectory),
    });
  }),
  save: aiDraftFilesProcedure.input(SaveInputSchema).mutation(async ({ ctx, input }) => {
    return await saveDraftQuestionFile({
      course: ctx.locals.course,
      question: ctx.question,
      user: ctx.locals.user,
      authn_user: ctx.locals.authn_user,
      authz_data: ctx.authz_data,
      urlPrefix: ctx.locals.urlPrefix,
      filePath: normalizeQuestionFilePath(input.filePath),
      contents: b64DecodeUnicode(input.encodedContents),
    });
  }),
  rename: aiDraftFilesProcedure.input(RenameInputSchema).mutation(async ({ ctx, input }) => {
    return await renameDraftQuestionFile({
      course: ctx.locals.course,
      question: ctx.question,
      user: ctx.locals.user,
      authn_user: ctx.locals.authn_user,
      authz_data: ctx.authz_data,
      urlPrefix: ctx.locals.urlPrefix,
      oldFilePath: input.oldFilePath,
      newFilePath: input.newFilePath,
    });
  }),
  delete: aiDraftFilesProcedure.input(DeleteInputSchema).mutation(async ({ ctx, input }) => {
    return await deleteDraftQuestionFile({
      course: ctx.locals.course,
      question: ctx.question,
      user: ctx.locals.user,
      authn_user: ctx.locals.authn_user,
      authz_data: ctx.authz_data,
      urlPrefix: ctx.locals.urlPrefix,
      filePath: input.filePath,
    });
  }),
});

const _aiDraftFilesTrpcRouter = t.router({
  aiDraftFiles: aiDraftFilesRouter,
});

export type AiDraftFilesTrpcRouter = typeof _aiDraftFilesTrpcRouter;
