import * as path from 'node:path';

import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';
import { IdSchema } from '@prairielearn/zod';

import type { Course, Question } from '../../lib/db-types.js';
import {
  browseDraftQuestionFiles,
  getDraftQuestionFileContents,
} from '../../lib/draft-question-files/browser.js';
import {
  EditJobFailedError,
  deleteDraftQuestionFile,
  editJobFailedAppError,
  renameDraftQuestion,
  renameDraftQuestionFile,
  saveDraftQuestionFiles,
  uploadDraftQuestionFile,
} from '../../lib/draft-question-files/mutations.js';
import {
  ModifiableQuestionFilePathSchema,
  QuestionRelativeDirectorySchema,
  QuestionRelativeFilePathSchema,
  requireQuestionQid,
} from '../../lib/draft-question-files/paths.js';
import { getReservedDraftUploadReason } from '../../lib/draft-question-files/paths.shared.js';
import { ROOT_SELECTION } from '../../lib/draft-question-files/selection.js';
import { classifyDraftQuestion } from '../../lib/draft-question.ts';
import { FileModifyConflictError } from '../../lib/editors.js';
import { features } from '../../lib/features/index.js';
import type { ResLocalsForPage } from '../../lib/res-locals.js';
import { selectOptionalQuestionById } from '../../models/question.js';
import { throwAppError } from '../app-errors.js';

import { requireCoursePermissionEdit, requireNotExampleCourse, t } from './init.js';

/** A draft file edit whose underlying server job failed to sync. */
interface EditJobFailed {
  code: 'SYNC_JOB_FAILED';
  jobSequenceId: string;
}

/**
 * A save rejected because a file on disk changed or was deleted since the
 * editor was opened. The client offers a reload or a forced overwrite (re-saving
 * with `force`).
 */
interface StaleEdit {
  code: 'STALE_EDIT';
  /** Question-relative path of the conflicting file, when known. */
  filePath: string | null;
  reason: 'changed' | 'deleted';
}

/**
 * Typed errors for the draft-file operations the client invokes, keyed by
 * procedure so callers narrow with `getAppError<AiDraftFilesError['<Op>']>`.
 * A procedure with no typed errors is declared `never` (resolving client-side
 * to just the `UNKNOWN` branch), so the map stays a complete picture of the
 * surface.
 */
export interface AiDraftFilesError {
  Contents: never;
  Browse: never;
  Save: EditJobFailed | StaleEdit;
  Rename: EditJobFailed;
  RenameQuestion: EditJobFailed;
  Delete: EditJobFailed;
  Upload: EditJobFailed;
}

const requireAiQuestionGenerationEnabled = t.middleware(async (opts) => {
  if (!(await features.enabledFromLocals('ai-question-generation', opts.ctx.locals))) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Feature not enabled',
    });
  }
  return opts.next();
});

/** Resolves `questionId` to a draft question in this course, or throws `NOT_FOUND`. */
async function resolveDraftQuestionOrThrow({
  course,
  questionId,
}: {
  course: Course;
  questionId: string;
}) {
  const question = await selectOptionalQuestionById(questionId);
  const classified = classifyDraftQuestion(course, question);
  if (classified.kind !== 'draft') {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Draft question not found' });
  }
  return classified.question;
}

/** Resolves the draft question named by the request's `questionId` onto `ctx`. */
const resolveDraftQuestion = t.middleware(async (opts) => {
  const { questionId } = z.object({ questionId: IdSchema }).parse(await opts.getRawInput());
  const question = await resolveDraftQuestionOrThrow({
    course: opts.ctx.locals.course,
    questionId,
  });
  return opts.next({ ctx: { question } });
});

const draftFilesProcedure = t.procedure
  .use(requireCoursePermissionEdit)
  .use(requireNotExampleCourse)
  .use(requireAiQuestionGenerationEnabled);

const aiDraftFilesProcedure = draftFilesProcedure.use(resolveDraftQuestion);

/**
 * The context fields the `mutations.ts` file mutations expect. Drawn from the
 * raw `locals` (not the extracted page context) because the editors need the
 * full database-typed `course` / `authz_data`.
 */
function mutationContext({
  locals,
  question,
}: {
  locals: ResLocalsForPage<'course'>;
  question: Question;
}) {
  return {
    course: locals.course,
    question,
    user: locals.user,
    authz_data: locals.authz_data,
  };
}

/**
 * The upload's destination, mirrored from {@link DraftUploadTarget} on the
 * client: replace an exact existing file, or create a new file under its
 * original name in `directory` (the question root when omitted).
 */
const UploadFieldsSchema = z.discriminatedUnion('kind', [
  z.object({ questionId: IdSchema, kind: z.literal('replace'), filePath: z.string().min(1) }),
  z.object({ questionId: IdSchema, kind: z.literal('new'), directory: z.string().optional() }),
]);

export const aiDraftFilesRouter = t.router({
  contents: aiDraftFilesProcedure
    .input(z.object({ questionId: IdSchema }))
    .query(async ({ ctx }) => {
      return await getDraftQuestionFileContents({
        courseId: ctx.locals.course.id,
        questionId: ctx.question.id,
      });
    }),
  browse: aiDraftFilesProcedure
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
            z.object({ kind: z.literal('dir'), path: QuestionRelativeDirectorySchema.nullable() }),
          ])
          .catch(ROOT_SELECTION),
      }),
    )
    .query(async ({ ctx, input }) => {
      return await browseDraftQuestionFiles({
        resLocals: { ...ctx.locals, question: ctx.question },
        selection: input.selection,
      });
    }),
  save: aiDraftFilesProcedure
    .input(
      z.object({
        questionId: IdSchema,
        /**
         * The files to write, each as a question-relative path, its base64-encoded
         * contents (`null` deletes the file), and the hash of the contents the
         * editor was opened with (`null` when the file did not exist), as the
         * stale-edit guard. Applied as one atomic job; a conflict on any file
         * rejects the whole save before anything is written.
         */
        files: z
          .array(
            z.object({
              path: ModifiableQuestionFilePathSchema,
              encodedContents: z.string().nullable(),
              origHash: z.string().nullable(),
            }),
          )
          .min(1),
        /**
         * When true, save even if a file on disk no longer matches its `origHash` —
         * the user chose to overwrite a concurrent change after a `STALE_EDIT`.
         */
        force: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        await saveDraftQuestionFiles({
          ...mutationContext(ctx),
          files: input.files,
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
            filePath: err.filePath ?? (input.files.length === 1 ? input.files[0].path : null),
            reason: err.reason,
          });
        }
        if (err instanceof EditJobFailedError) {
          throwAppError<AiDraftFilesError['Save']>(editJobFailedAppError(err));
        }
        throw err;
      }
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
      try {
        await renameDraftQuestionFile({
          ...mutationContext(ctx),
          oldFilePath: input.oldFilePath,
          newFilePath: input.newFilePath,
        });
      } catch (err) {
        if (err instanceof EditJobFailedError) {
          throwAppError<AiDraftFilesError['Rename']>(editJobFailedAppError(err));
        }
        throw err;
      }
      return null;
    }),
  renameQuestion: aiDraftFilesProcedure
    .input(
      z.object({
        questionId: IdSchema,
        /**
         * An omitted QID or title leaves that value unchanged, so the inline
         * editor can update the QID and title independently.
         */
        qid: z.string().min(1).optional(),
        title: z.string().min(1).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const question = await renameDraftQuestion({
          ...mutationContext(ctx),
          qid: input.qid ?? requireQuestionQid(ctx.question),
          title: input.title ?? ctx.question.title ?? undefined,
        });
        return { qid: question.qid, title: question.title };
      } catch (err) {
        if (err instanceof EditJobFailedError) {
          throwAppError<AiDraftFilesError['RenameQuestion']>(
            editJobFailedAppError(err, 'Renaming the question failed to sync.'),
          );
        }
        if (err instanceof HttpStatusError) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: err.message });
        }
        throw err;
      }
    }),
  delete: aiDraftFilesProcedure
    .input(
      z.object({
        questionId: IdSchema,
        filePath: ModifiableQuestionFilePathSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        await deleteDraftQuestionFile({
          ...mutationContext(ctx),
          filePath: input.filePath,
        });
      } catch (err) {
        if (err instanceof EditJobFailedError) {
          throwAppError<AiDraftFilesError['Delete']>(editJobFailedAppError(err));
        }
        throw err;
      }
      return null;
    }),
  // Uploads are sent as `multipart/form-data` (tRPC has no JSON encoding for
  // file payloads), so the fields arrive as `FormData` strings rather than
  // typed input. `resolveDraftQuestion` can't parse `questionId` from a
  // `FormData` body, so the question is resolved inline.
  upload: draftFilesProcedure.input(z.instanceof(FormData)).mutation(async ({ ctx, input }) => {
    const file = input.get('file');
    if (!(file instanceof File)) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'No file uploaded' });
    }
    const fields = UploadFieldsSchema.safeParse(Object.fromEntries(input.entries()));
    if (!fields.success) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid upload request' });
    }

    const question = await resolveDraftQuestionOrThrow({
      course: ctx.locals.course,
      questionId: fields.data.questionId,
    });

    const requestedPath =
      fields.data.kind === 'replace'
        ? fields.data.filePath
        : path.posix.join(fields.data.directory ?? '', file.name);
    const filePath = ModifiableQuestionFilePathSchema.safeParse(requestedPath);
    if (!filePath.success) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: filePath.error.issues[0]?.message ?? 'Invalid file path',
      });
    }
    const reservedReason = getReservedDraftUploadReason(filePath.data);
    if (reservedReason != null) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: reservedReason });
    }

    try {
      await uploadDraftQuestionFile({
        ...mutationContext({ locals: ctx.locals, question }),
        filePath: filePath.data,
        fileContents: Buffer.from(await file.arrayBuffer()),
      });
    } catch (err) {
      if (err instanceof EditJobFailedError) {
        throwAppError<AiDraftFilesError['Upload']>(editJobFailedAppError(err));
      }
      throw err;
    }
    return null;
  }),
});
