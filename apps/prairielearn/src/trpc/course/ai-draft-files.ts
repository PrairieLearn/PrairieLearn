import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { b64DecodeUnicode } from '../../lib/base64-util.js';
import { features } from '../../lib/features/index.js';
import { idsEqual } from '../../lib/id.js';
import type { ResLocalsForPage } from '../../lib/res-locals.js';
import { selectOptionalQuestionById } from '../../models/question.js';
import {
  getQuestionFilesData,
  saveDraftQuestionFile,
} from '../../ee/pages/instructorAiGenerateDraftEditor/draftFileEditor.js';
import { normalizeQuestionFilePath } from '../../ee/pages/instructorAiGenerateDraftEditor/selectedQuestionFile.js';

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
  questionId: z.string(),
  urlPrefix: z.string(),
  editorUrl: z.string(),
  selectedFilePath: z.string().nullable(),
  selectedDirectory: z.string().nullable(),
});

const SaveInputSchema = z.object({
  questionId: z.string(),
  urlPrefix: z.string(),
  filePath: z.string(),
  contents: z.string(),
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

export const aiDraftFilesRouter = t.router({
  list: aiDraftFilesProcedure.input(ListInputSchema).query(async ({ ctx, input }) => {
    const question = await selectDraftQuestionOrThrow({
      courseId: ctx.course.id,
      questionId: input.questionId,
    });

    return getQuestionFilesData({
      resLocals: {
        ...ctx.locals,
        urlPrefix: input.urlPrefix,
        question,
      } as ResLocalsForPage<'instructor-question'>,
      editorUrl: input.editorUrl,
      selectedFile: input.selectedFilePath,
      selectedDirectory: input.selectedDirectory,
    });
  }),
  save: aiDraftFilesProcedure.input(SaveInputSchema).mutation(async ({ ctx, input }) => {
    const question = await selectDraftQuestionOrThrow({
      courseId: ctx.course.id,
      questionId: input.questionId,
    });

    return saveDraftQuestionFile({
      course: ctx.course,
      question,
      user: ctx.locals.user,
      authn_user: ctx.locals.authn_user,
      authz_data: ctx.authz_data,
      urlPrefix: input.urlPrefix,
      filePath: normalizeQuestionFilePath(input.filePath),
      contents: b64DecodeUnicode(input.contents),
    });
  }),
});
