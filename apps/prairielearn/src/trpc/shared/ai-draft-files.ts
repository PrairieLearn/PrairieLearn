import { TRPCError, initTRPC } from '@trpc/server';
import superjson from 'superjson';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import { IdSchema } from '@prairielearn/zod';

import { b64DecodeUnicode } from '../../lib/base64-util.js';
import type { Course, Question, User } from '../../lib/db-types.js';
import {
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

interface DraftQuestionFilesLocals {
  __csrf_token: string;
  authn_user: User;
  authz_data: {
    has_course_permission_edit: boolean;
  };
  course: Course;
  question: Question;
  urlPrefix: string;
  user: User;
}

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

function throwTrpcError(err: unknown): never {
  if (err instanceof error.HttpStatusError) {
    throw new TRPCError({
      code: err.status === 404 ? 'NOT_FOUND' : err.status === 403 ? 'FORBIDDEN' : 'BAD_REQUEST',
      message: err.message,
    });
  }
  throw err;
}

async function listDraftQuestionFiles({
  courseId,
  locals,
  input,
}: {
  courseId: string;
  locals: Omit<DraftQuestionFilesLocals, 'question'>;
  input: z.infer<typeof ListInputSchema>;
}) {
  const question = await selectDraftQuestionOrThrow({
    courseId,
    questionId: input.questionId,
  });

  try {
    return await getQuestionFilesData({
      resLocals: {
        ...locals,
        question,
      },
      editorUrl: `${locals.urlPrefix}/ai_generate_editor/${question.id}`,
      selectedFilePath: getSelectedQuestionFilePath(input.selectedFilePath),
      selectedDirectory: getSelectedQuestionDirectory(input.selectedDirectory),
    });
  } catch (err) {
    throwTrpcError(err);
  }
}

async function saveDraftQuestion({
  courseId,
  locals,
  authzData,
  input,
}: {
  courseId: string;
  locals: Omit<DraftQuestionFilesLocals, 'question'>;
  authzData: DraftQuestionFilesLocals['authz_data'];
  input: z.infer<typeof SaveInputSchema>;
}) {
  const question = await selectDraftQuestionOrThrow({
    courseId,
    questionId: input.questionId,
  });

  try {
    return await saveDraftQuestionFile({
      course: locals.course,
      question,
      user: locals.user,
      authn_user: locals.authn_user,
      authz_data: authzData,
      urlPrefix: locals.urlPrefix,
      filePath: normalizeQuestionFilePath(input.filePath),
      contents: b64DecodeUnicode(input.encodedContents),
    });
  } catch (err) {
    throwTrpcError(err);
  }
}

async function renameDraftQuestion({
  courseId,
  locals,
  authzData,
  input,
}: {
  courseId: string;
  locals: Omit<DraftQuestionFilesLocals, 'question'>;
  authzData: DraftQuestionFilesLocals['authz_data'];
  input: z.infer<typeof RenameInputSchema>;
}) {
  const question = await selectDraftQuestionOrThrow({
    courseId,
    questionId: input.questionId,
  });

  try {
    return await renameDraftQuestionFile({
      course: locals.course,
      question,
      user: locals.user,
      authn_user: locals.authn_user,
      authz_data: authzData,
      urlPrefix: locals.urlPrefix,
      oldFilePath: input.oldFilePath,
      newFilePath: input.newFilePath,
    });
  } catch (err) {
    throwTrpcError(err);
  }
}

async function deleteDraftQuestion({
  courseId,
  locals,
  authzData,
  input,
}: {
  courseId: string;
  locals: Omit<DraftQuestionFilesLocals, 'question'>;
  authzData: DraftQuestionFilesLocals['authz_data'];
  input: z.infer<typeof DeleteInputSchema>;
}) {
  const question = await selectDraftQuestionOrThrow({
    courseId,
    questionId: input.questionId,
  });

  try {
    return await deleteDraftQuestionFile({
      course: locals.course,
      question,
      user: locals.user,
      authn_user: locals.authn_user,
      authz_data: authzData,
      urlPrefix: locals.urlPrefix,
      filePath: input.filePath,
    });
  } catch (err) {
    throwTrpcError(err);
  }
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

const aiDraftFilesProcedure = t.procedure
  .use(requireCoursePermissionEdit)
  .use(requireNotExampleCourse)
  .use(requireAiQuestionGenerationEnabled);

export const aiDraftFilesRouter = t.router({
  list: aiDraftFilesProcedure.input(ListInputSchema).query(async ({ ctx, input }) => {
    return await listDraftQuestionFiles({
      courseId: ctx.course.id,
      locals: ctx.locals,
      input,
    });
  }),
  save: aiDraftFilesProcedure.input(SaveInputSchema).mutation(async ({ ctx, input }) => {
    return await saveDraftQuestion({
      courseId: ctx.course.id,
      locals: ctx.locals,
      authzData: ctx.authz_data,
      input,
    });
  }),
  rename: aiDraftFilesProcedure.input(RenameInputSchema).mutation(async ({ ctx, input }) => {
    return await renameDraftQuestion({
      courseId: ctx.course.id,
      locals: ctx.locals,
      authzData: ctx.authz_data,
      input,
    });
  }),
  delete: aiDraftFilesProcedure.input(DeleteInputSchema).mutation(async ({ ctx, input }) => {
    return await deleteDraftQuestion({
      courseId: ctx.course.id,
      locals: ctx.locals,
      authzData: ctx.authz_data,
      input,
    });
  }),
});

const _aiDraftFilesTrpcRouter = t.router({
  aiDraftFiles: aiDraftFilesRouter,
});

export type AiDraftFilesTrpcRouter = typeof _aiDraftFilesTrpcRouter;
