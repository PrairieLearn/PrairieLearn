import { TRPCError, initTRPC } from '@trpc/server';
import superjson from 'superjson';
import { z } from 'zod';

import { IdSchema } from '@prairielearn/zod';

import { b64DecodeUnicode } from '../../lib/base64-util.js';
import {
  type DraftQuestionFilesLocals,
  getQuestionFilesData,
} from '../../lib/draft-question-files/browser.js';
import {
  EditJobFailedError,
  deleteDraftQuestionFile,
  renameDraftQuestionFile,
  saveDraftQuestionFile,
} from '../../lib/draft-question-files/mutations.js';
import {
  ModifiableQuestionFilePathSchema,
  OptionalSelectedDirectorySchema,
  OptionalSelectedFilePathSchema,
} from '../../lib/draft-question-files/paths.js';
import { classifyDraftQuestion } from '../../lib/draft-question-files/question.js';
import { features } from '../../lib/features/index.js';
import { appErrorFormatter, throwAppError } from '../app-errors.js';

/** A draft file edit whose underlying server job failed to sync. */
type EditJobFailed = { code: 'EDIT_JOB_FAILED'; jobSequenceId: string };

export interface AiDraftFilesError {
  List: never;
  Save: EditJobFailed;
  Rename: EditJobFailed;
  Delete: EditJobFailed;
}

const ListInputSchema = z.object({
  questionId: IdSchema,
  selectedFilePath: OptionalSelectedFilePathSchema,
  selectedDirectory: OptionalSelectedDirectorySchema,
});

const SaveInputSchema = z.object({
  questionId: IdSchema,
  filePath: ModifiableQuestionFilePathSchema,
  encodedContents: z.string(),
});

const RenameInputSchema = z.object({
  questionId: IdSchema,
  oldFilePath: ModifiableQuestionFilePathSchema,
  newFilePath: ModifiableQuestionFilePathSchema,
});

const DeleteInputSchema = z.object({
  questionId: IdSchema,
  filePath: ModifiableQuestionFilePathSchema,
});

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
 * Translates an {@link EditJobFailedError} raised by a file mutation into a
 * typed `EDIT_JOB_FAILED` app error, so the client can render a link to the
 * job's logs. Other errors propagate unchanged.
 */
const translateEditJobFailedError = t.middleware(async (opts) => {
  const result = await opts.next();
  if (!result.ok && result.error.cause instanceof EditJobFailedError) {
    throwAppError<AiDraftFilesError['Save']>({
      code: 'EDIT_JOB_FAILED',
      message: 'The file edit failed to sync.',
      jobSequenceId: result.error.cause.jobSequenceId,
    });
  }
  return result;
});

/** Resolves the draft question named by the request's `questionId` onto `ctx`. */
const resolveDraftQuestion = t.middleware(async (opts) => {
  const { questionId } = z.object({ questionId: IdSchema }).parse(await opts.getRawInput());
  const classified = await classifyDraftQuestion({
    courseId: opts.ctx.course.id,
    questionId,
  });
  if (classified.kind !== 'draft') {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Draft question not found' });
  }
  return opts.next({ ctx: { question: classified.question } });
});

const aiDraftFilesProcedure = t.procedure
  .use(requireCoursePermissionEdit)
  .use(requireNotExampleCourse)
  .use(requireAiQuestionGenerationEnabled)
  .use(translateEditJobFailedError)
  .use(resolveDraftQuestion);

export const aiDraftFilesRouter = t.router({
  list: aiDraftFilesProcedure.input(ListInputSchema).query(async ({ ctx, input }) => {
    return await getQuestionFilesData({
      resLocals: { ...ctx.locals, question: ctx.question },
      editorUrl: `${ctx.locals.urlPrefix}/ai_generate_editor/${ctx.question.id}`,
      selectedFilePath: input.selectedFilePath,
      selectedDirectory: input.selectedDirectory,
    });
  }),
  save: aiDraftFilesProcedure.input(SaveInputSchema).mutation(async ({ ctx, input }) => {
    await saveDraftQuestionFile({
      course: ctx.locals.course,
      question: ctx.question,
      user: ctx.locals.user,
      authn_user: ctx.locals.authn_user,
      authz_data: ctx.authz_data,
      filePath: input.filePath,
      contents: b64DecodeUnicode(input.encodedContents),
    });
    return null;
  }),
  rename: aiDraftFilesProcedure.input(RenameInputSchema).mutation(async ({ ctx, input }) => {
    await renameDraftQuestionFile({
      course: ctx.locals.course,
      question: ctx.question,
      user: ctx.locals.user,
      authn_user: ctx.locals.authn_user,
      authz_data: ctx.authz_data,
      oldFilePath: input.oldFilePath,
      newFilePath: input.newFilePath,
    });
    return null;
  }),
  delete: aiDraftFilesProcedure.input(DeleteInputSchema).mutation(async ({ ctx, input }) => {
    await deleteDraftQuestionFile({
      course: ctx.locals.course,
      question: ctx.question,
      user: ctx.locals.user,
      authn_user: ctx.locals.authn_user,
      authz_data: ctx.authz_data,
      filePath: input.filePath,
    });
    return null;
  }),
});

const _aiDraftFilesTrpcRouter = t.router({
  aiDraftFiles: aiDraftFilesRouter,
});

export type AiDraftFilesTrpcRouter = typeof _aiDraftFilesTrpcRouter;
