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
  editJobFailedAppError,
  renameDraftQuestionFile,
  saveDraftQuestionFile,
  saveDraftQuestionFiles,
} from '../../lib/draft-question-files/mutations.js';
import {
  ModifiableQuestionFilePathSchema,
  QuestionRelativeDirectorySchema,
  QuestionRelativeFilePathSchema,
} from '../../lib/draft-question-files/paths.js';
import { classifyDraftQuestion } from '../../lib/draft-question-files/question.js';
import { ROOT_SELECTION } from '../../lib/draft-question-files/selection.js';
import { FileModifyConflictError } from '../../lib/editors.js';
import { features } from '../../lib/features/index.js';
import { appErrorFormatter, throwAppError } from '../app-errors.js';

/** A draft file edit whose underlying server job failed to sync. */
interface EditJobFailed {
  code: 'SYNC_JOB_FAILED';
  jobSequenceId: string;
}

/**
 * A save rejected because the file on disk changed or was deleted since the
 * editor was opened. The client offers a reload or a forced overwrite (re-saving
 * with `force`).
 */
interface StaleEdit {
  code: 'STALE_EDIT';
}

/**
 * Typed errors for the draft-file operations the client invokes, keyed by
 * operation so callers narrow with `getAppError<AiDraftFilesError['<Op>']>`.
 * These are the `aiDraftFiles` tRPC procedures plus `Upload`, which is served by
 * a multipart route rather than tRPC (tRPC has no multipart support) but shares
 * the same `SYNC_JOB_FAILED` error contract. An operation with no typed errors
 * is declared `never` (resolving client-side to just the `UNKNOWN` branch), so
 * the map stays a complete picture of the surface.
 */
export interface AiDraftFilesError {
  List: never;
  Save: EditJobFailed | StaleEdit;
  SaveFiles: EditJobFailed;
  Rename: EditJobFailed;
  Delete: EditJobFailed;
  Upload: EditJobFailed;
}

/**
 * The `aiDraftFiles` router is mounted only on the `course` tRPC tree. It needs
 * just course-level context, so it defines its own tRPC instance with this
 * minimal context that the course tree satisfies, keeping its client-side router
 * type accurate and self-contained.
 *
 * tRPC's router nesting does not check that the host tree actually provides this
 * context, so `ai-draft-files.test.ts` asserts that compatibility at build time.
 */
export interface AiDraftFilesContext {
  locals: Omit<DraftQuestionFilesLocals, 'question'>;
}

const t = initTRPC.context<AiDraftFilesContext>().create({
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
    throwAppError<AiDraftFilesError['Save']>(editJobFailedAppError(result.error.cause));
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

/** The context fields the `mutations.ts` file mutations expect, drawn from `ctx`. */
function mutationContext(ctx: {
  locals: AiDraftFilesContext['locals'];
  question: DraftQuestionFilesLocals['question'];
}) {
  return {
    course: ctx.locals.course,
    question: ctx.question,
    user: ctx.locals.user,
    authn_user: ctx.locals.authn_user,
    authz_data: ctx.locals.authz_data,
  };
}

export const aiDraftFilesRouter = t.router({
  list: aiDraftFilesProcedure
    .input(
      z.object({
        questionId: IdSchema,
        /**
         * Server-side validation for the URL `selection` state. Falls back to
         * the root for any malformed input so a stale client-side selection
         * cannot break the load.
         */
        selection: z
          .discriminatedUnion('kind', [
            z.object({ kind: z.literal('file'), path: QuestionRelativeFilePathSchema }),
            z.object({ kind: z.literal('dir'), path: QuestionRelativeDirectorySchema }),
          ])
          .catch(ROOT_SELECTION),
      }),
    )
    .query(async ({ ctx, input }) => {
      return await getQuestionFilesData({
        resLocals: { ...ctx.locals, question: ctx.question },
        editorUrl: `${ctx.locals.urlPrefix}/ai_generate_editor/${ctx.question.id}`,
        selection: input.selection,
      });
    }),
  save: aiDraftFilesProcedure
    .input(
      z.object({
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
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        await saveDraftQuestionFile({
          ...mutationContext(ctx),
          filePath: input.filePath,
          encodedContents: input.encodedContents,
          origHash: input.origHash,
          force: input.force,
        });
      } catch (err) {
        if (err instanceof FileModifyConflictError) {
          throwAppError<AiDraftFilesError['Save']>({
            code: 'STALE_EDIT',
            message:
              err.reason === 'deleted'
                ? 'This file was deleted since you opened it.'
                : 'This file changed since you opened it.',
          });
        }
        throw err;
      }
      return null;
    }),
  saveFiles: aiDraftFilesProcedure
    .input(
      z.object({
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
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await saveDraftQuestionFiles({
        ...mutationContext(ctx),
        files: Object.fromEntries(input.files.map((file) => [file.path, file.encodedContents])),
      });
      return null;
    }),
  rename: aiDraftFilesProcedure
    .input(
      z.object({
        questionId: IdSchema,
        oldFilePath: ModifiableQuestionFilePathSchema,
        newFilePath: ModifiableQuestionFilePathSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await renameDraftQuestionFile({
        ...mutationContext(ctx),
        oldFilePath: input.oldFilePath,
        newFilePath: input.newFilePath,
      });
      return null;
    }),
  delete: aiDraftFilesProcedure
    .input(
      z.object({
        questionId: IdSchema,
        filePath: ModifiableQuestionFilePathSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await deleteDraftQuestionFile({
        ...mutationContext(ctx),
        filePath: input.filePath,
      });
      return null;
    }),
});

const _aiDraftFilesTrpcRouter = t.router({
  aiDraftFiles: aiDraftFilesRouter,
});

export type AiDraftFilesTrpcRouter = typeof _aiDraftFilesTrpcRouter;
