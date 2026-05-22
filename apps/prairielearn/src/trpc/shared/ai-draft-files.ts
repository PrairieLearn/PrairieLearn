import { TRPCError, initTRPC } from '@trpc/server';
import superjson from 'superjson';
import { z } from 'zod';

import { IdSchema } from '@prairielearn/zod';

import {
  type DraftQuestionFilesLocals,
  getQuestionFilesData,
} from '../../lib/draft-question-files/browser.js';
import {
  EditJobFailedError,
  deleteDraftQuestionFile,
  getDraftQuestionFileHash,
  renameDraftQuestionFile,
  saveDraftQuestionFile,
  saveDraftQuestionFiles,
} from '../../lib/draft-question-files/mutations.js';
import {
  ModifiableQuestionFilePathSchema,
  OptionalSelectedDirectorySchema,
  OptionalSelectedFilePathSchema,
} from '../../lib/draft-question-files/paths.js';
import { classifyDraftQuestion } from '../../lib/draft-question-files/question.js';
import { features } from '../../lib/features/index.js';
import { appErrorFormatter, throwAppError } from '../app-errors.js';
import type { createContext as createCourseContext } from '../course/init.js';
import type { createContext as createCourseInstanceContext } from '../courseInstance/init.js';

/** A draft file edit whose underlying server job failed to sync. */
interface EditJobFailed {
  code: 'SYNC_JOB_FAILED';
  jobSequenceId: string;
}

/**
 * A save rejected because the file on disk changed since the editor was opened.
 * The client offers a reload or a forced overwrite (re-saving with `force`).
 */
interface StaleEdit {
  code: 'STALE_EDIT';
}

export interface AiDraftFilesError {
  List: never;
  Save: EditJobFailed | StaleEdit;
  SaveFiles: EditJobFailed;
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
  /** Hash of the contents the editor was opened with, for the stale-edit guard. */
  origHash: z.string(),
  /**
   * When true, save even if the file on disk no longer matches `origHash` —
   * the user chose to overwrite a concurrent change after a `STALE_EDIT`.
   */
  force: z.boolean().optional(),
});

const SaveFilesInputSchema = z.object({
  questionId: IdSchema,
  /**
   * The files to write, each as a question-relative path and its base64-encoded
   * contents — or `null` contents to delete the file. Applied as one atomic job.
   */
  files: z
    .array(
      z.object({
        path: ModifiableQuestionFilePathSchema,
        encodedContents: z.string().nullable(),
      }),
    )
    .min(1),
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
  locals: Omit<DraftQuestionFilesLocals, 'question'>;
}

/**
 * Resolves to `TContext`, but only if every type in `THostContexts` is
 * assignable to it. The `aiDraftFiles` router is nested into both the `course`
 * and `courseInstance` trees, which are built from separate tRPC instances with
 * their own context types. Threading the host context types through this
 * constraint fails the build if either host tree stops providing what
 * {@link AiDraftFilesContext} needs (e.g. a dropped `locals.course` /
 * `locals.authz_data`), instead of breaking only at runtime.
 */
type ContextSatisfiedByHosts<TContext, THostContexts extends TContext> = [THostContexts] extends [
  TContext,
]
  ? TContext
  : never;

const t = initTRPC
  .context<
    ContextSatisfiedByHosts<
      AiDraftFilesContext,
      | Awaited<ReturnType<typeof createCourseContext>>
      | Awaited<ReturnType<typeof createCourseInstanceContext>>
    >
  >()
  .create({
    transformer: superjson,
    errorFormatter: appErrorFormatter,
  });

const requireCoursePermissionEdit = t.middleware(async (opts) => {
  if (!opts.ctx.locals.authz_data.has_course_permission_edit) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Access denied (must be a course editor)',
    });
  }
  return opts.next();
});

const requireNotExampleCourse = t.middleware(async (opts) => {
  if (opts.ctx.locals.course.example_course) {
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
 * typed `SYNC_JOB_FAILED` app error, so the client can render a link to the
 * job's logs. Other errors propagate unchanged.
 */
const translateEditJobFailedError = t.middleware(async (opts) => {
  const result = await opts.next();
  if (!result.ok && result.error.cause instanceof EditJobFailedError) {
    throwAppError<AiDraftFilesError['Save']>({
      code: 'SYNC_JOB_FAILED',
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
    courseId: opts.ctx.locals.course.id,
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
    // Pre-flight stale-edit check: if the file on disk no longer matches the
    // hash the editor was opened with, surface a typed `STALE_EDIT` rather than
    // letting the edit run and fail as a generic sync error. `FileModifyEditor`
    // re-checks the hash and is the race-proof guard; this just produces a
    // clean, typed conflict in the common case. A `force` save (the user chose
    // to overwrite) saves against the current disk hash instead.
    const diskHash = await getDraftQuestionFileHash({
      course: ctx.locals.course,
      question: ctx.question,
      filePath: input.filePath,
    });
    if (!input.force && diskHash != null && diskHash !== input.origHash) {
      throwAppError<AiDraftFilesError['Save']>({
        code: 'STALE_EDIT',
        message: 'This file changed since you opened it.',
      });
    }

    await saveDraftQuestionFile({
      course: ctx.locals.course,
      question: ctx.question,
      user: ctx.locals.user,
      authn_user: ctx.locals.authn_user,
      authz_data: ctx.locals.authz_data,
      filePath: input.filePath,
      encodedContents: input.encodedContents,
      origHash: input.force && diskHash != null ? diskHash : input.origHash,
    });
    return null;
  }),
  saveFiles: aiDraftFilesProcedure.input(SaveFilesInputSchema).mutation(async ({ ctx, input }) => {
    await saveDraftQuestionFiles({
      course: ctx.locals.course,
      question: ctx.question,
      user: ctx.locals.user,
      authn_user: ctx.locals.authn_user,
      authz_data: ctx.locals.authz_data,
      files: Object.fromEntries(input.files.map((file) => [file.path, file.encodedContents])),
    });
    return null;
  }),
  rename: aiDraftFilesProcedure.input(RenameInputSchema).mutation(async ({ ctx, input }) => {
    await renameDraftQuestionFile({
      course: ctx.locals.course,
      question: ctx.question,
      user: ctx.locals.user,
      authn_user: ctx.locals.authn_user,
      authz_data: ctx.locals.authz_data,
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
      authz_data: ctx.locals.authz_data,
      filePath: input.filePath,
    });
    return null;
  }),
});

const _aiDraftFilesTrpcRouter = t.router({
  aiDraftFiles: aiDraftFilesRouter,
});

export type AiDraftFilesTrpcRouter = typeof _aiDraftFilesTrpcRouter;
