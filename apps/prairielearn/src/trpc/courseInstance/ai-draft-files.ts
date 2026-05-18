import { TRPCError } from '@trpc/server';

import { features } from '../../lib/features/index.js';
import {
  ListInputSchema,
  SaveInputSchema,
  listDraftQuestionFiles,
  saveDraftQuestion,
} from '../ai-draft-files.js';

import { requireCoursePermissionEdit, t } from './init.js';

const requireNotExampleCourse = t.middleware(async (opts) => {
  if (opts.ctx.course.example_course) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Access denied. Cannot make changes to example course.',
    });
  }
  return opts.next();
});

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
});
