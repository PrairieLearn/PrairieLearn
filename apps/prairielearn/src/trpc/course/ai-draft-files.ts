import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import { IdSchema } from '@prairielearn/zod';

import { b64DecodeUnicode } from '../../lib/base64-util.js';
import {
  getQuestionFilesData,
  getSelectedQuestionDirectory,
  getSelectedQuestionFilePath,
  normalizeQuestionFilePath,
  saveDraftQuestionFile,
} from '../../lib/draft-question-files.js';
import { features } from '../../lib/features/index.js';
import { idsEqual } from '../../lib/id.js';
import { selectOptionalQuestionById } from '../../models/question.js';

import { requireCoursePermissionEdit, requireNotExampleCourse, t } from './init.js';

export interface AiDraftFilesError {
  List: never;
  Save: never;
}

const aiDraftFilesProcedure = t.procedure
  .use(requireCoursePermissionEdit)
  .use(requireNotExampleCourse)
  .use(async (opts) => {
    if (!(await features.enabledFromLocals('ai-question-generation', opts.ctx.locals))) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Feature not enabled',
      });
    }
    return opts.next();
  });

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

export const aiDraftFilesRouter = t.router({
  list: aiDraftFilesProcedure.input(ListInputSchema).query(async ({ ctx, input }) => {
    const question = await selectDraftQuestionOrThrow({
      courseId: ctx.course.id,
      questionId: input.questionId,
    });

    try {
      return await getQuestionFilesData({
        resLocals: {
          ...ctx.locals,
          question,
        },
        editorUrl: `${ctx.locals.urlPrefix}/ai_generate_editor/${question.id}`,
        selectedFilePath: getSelectedQuestionFilePath(input.selectedFilePath),
        selectedDirectory: getSelectedQuestionDirectory(input.selectedDirectory),
      });
    } catch (err) {
      throwTrpcError(err);
    }
  }),
  save: aiDraftFilesProcedure.input(SaveInputSchema).mutation(async ({ ctx, input }) => {
    const question = await selectDraftQuestionOrThrow({
      courseId: ctx.course.id,
      questionId: input.questionId,
    });

    try {
      return await saveDraftQuestionFile({
        course: ctx.locals.course,
        question,
        user: ctx.locals.user,
        authn_user: ctx.locals.authn_user,
        authz_data: ctx.authz_data,
        urlPrefix: ctx.locals.urlPrefix,
        filePath: normalizeQuestionFilePath(input.filePath),
        contents: b64DecodeUnicode(input.encodedContents),
      });
    } catch (err) {
      throwTrpcError(err);
    }
  }),
});
