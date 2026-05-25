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
  getDraftQuestionFileHash,
  renameDraftQuestionFile,
  saveDraftQuestionFile,
  saveDraftQuestionFiles,
  uploadDraftQuestionFile,
} from '../../lib/draft-question-files/mutations.js';
import {
  ModifiableQuestionFilePathSchema,
  QuestionRelativeDirectorySchema,
  QuestionRelativeFilePathSchema,
} from '../../lib/draft-question-files/paths.js';
import { classifyDraftQuestion } from '../../lib/draft-question-files/question.js';
import { ROOT_SELECTION } from '../../lib/draft-question-files/selection.js';
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
 * Server-side validation for the URL `selection` state. Falls back to the
 * root for any malformed input so a stale client-side selection cannot break
 * the load.
 */
const DraftEditorSelectionSchema = z
  .discriminatedUnion('kind', [
    z.object({ kind: z.literal('file'), path: QuestionRelativeFilePathSchema }),
    z.object({ kind: z.literal('dir'), path: QuestionRelativeDirectorySchema }),
  ])
  .catch(ROOT_SELECTION);

const ListInputSchema = z.object({
  questionId: IdSchema,
  selection: DraftEditorSelectionSchema,
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
 * instance with this minimal context that both trees satisfy. Nesting this
 * single router into both trees guarantees the two mounts can never drift apart
 * and share one accurate client-side router type.
 *
 * tRPC's router nesting does not check that the host trees actually provide this
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
  list: aiDraftFilesProcedure.input(ListInputSchema).query(async ({ ctx, input }) => {
    return await getQuestionFilesData({
      resLocals: { ...ctx.locals, question: ctx.question },
      editorUrl: `${ctx.locals.urlPrefix}/ai_generate_editor/${ctx.question.id}`,
      selection: input.selection,
    });
  }),
  save: aiDraftFilesProcedure.input(SaveInputSchema).mutation(async ({ ctx, input }) => {
    // Pre-flight stale-edit check: if the file on disk no longer matches the
    // hash the editor was opened with — including when it was deleted — surface
    // a typed `STALE_EDIT` rather than letting the edit run and fail as a
    // generic sync error.
    const diskHash = await getDraftQuestionFileHash({
      course: ctx.locals.course,
      question: ctx.question,
      filePath: input.filePath,
    });
    if (!input.force && diskHash !== input.origHash) {
      throwAppError<AiDraftFilesError['Save']>({
        code: 'STALE_EDIT',
        message:
          diskHash == null
            ? 'This file was deleted since you opened it.'
            : 'This file changed since you opened it.',
      });
    }

    if (diskHash == null) {
      // The file was deleted since the editor opened it and the user chose to
      // overwrite anyway. `FileModifyEditor` can't recreate it — it reads the
      // now-missing file to re-check the disk hash — so re-create the file from
      // the editor's contents instead.
      await uploadDraftQuestionFile({
        ...mutationContext(ctx),
        filePath: input.filePath,
        fileContents: Buffer.from(input.encodedContents, 'base64'),
      });
      return null;
    }

    await saveDraftQuestionFile({
      ...mutationContext(ctx),
      filePath: input.filePath,
      encodedContents: input.encodedContents,
      origHash: input.force ? diskHash : input.origHash,
    });
    return null;
  }),
  saveFiles: aiDraftFilesProcedure.input(SaveFilesInputSchema).mutation(async ({ ctx, input }) => {
    await saveDraftQuestionFiles({
      ...mutationContext(ctx),
      files: Object.fromEntries(input.files.map((file) => [file.path, file.encodedContents])),
    });
    return null;
  }),
  rename: aiDraftFilesProcedure.input(RenameInputSchema).mutation(async ({ ctx, input }) => {
    await renameDraftQuestionFile({
      ...mutationContext(ctx),
      oldFilePath: input.oldFilePath,
      newFilePath: input.newFilePath,
    });
    return null;
  }),
  delete: aiDraftFilesProcedure.input(DeleteInputSchema).mutation(async ({ ctx, input }) => {
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
