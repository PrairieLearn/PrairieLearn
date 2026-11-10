import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';
import { IdSchema } from '@prairielearn/zod';

import { StaffPrintFormSchema } from '../../lib/client/safe-db-types.js';
import { features } from '../../lib/features/index.js';
import { createPrintForm } from '../../lib/print-forms.js';
import { inspectPrintPreparationQuestions } from '../../lib/print-preparation.js';
import { selectOptionalPrintForm, selectPrintFormsForUser } from '../../models/print-form.js';

import { requireCoursePermissionPreview, t } from './init.js';

/** @knipignore Consumed by the preparation UI in the following PR. */
export interface PrintFormsError {
  questions: never;
  list: never;
  create: never;
  regenerate: never;
}

export const requirePrintableAssessments = t.middleware(async (opts) => {
  if (!(await features.enabledFromLocals('printable-assessments', opts.ctx.locals))) {
    throw new TRPCError({ code: 'NOT_FOUND' });
  }
  return opts.next();
});

const printFormProcedure = t.procedure
  .use(requireCoursePermissionPreview)
  .use(requirePrintableAssessments);

const createFormProcedure = printFormProcedure.use(async ({ ctx, next }) => {
  if (ctx.assessment.team_work) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Creating print forms for group assessments is not supported yet.',
    });
  }
  return next();
});

const ownedFormProcedure = printFormProcedure
  .input(z.object({ printFormId: IdSchema }))
  .use(async ({ ctx, input, next }) => {
    const form = await selectOptionalPrintForm({
      printFormId: input.printFormId,
      assessmentId: ctx.assessment.id,
      userId: ctx.locals.user.id,
    });
    if (!form) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'This print form is not available.' });
    }
    return next();
  });

const createForm = createFormProcedure.mutation(async ({ ctx, signal }) => {
  try {
    const form = await createPrintForm({
      assessment: ctx.assessment,
      course: ctx.course,
      courseInstance: ctx.course_instance,
      userId: ctx.locals.user.id,
      authnUserId: ctx.authn_user.id,
      signal,
    });
    return { printFormId: form.id };
  } catch (error) {
    if (error instanceof HttpStatusError && error.status === 400) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: error.message, cause: error });
    }
    throw error;
  }
});

export const printFormsRouter = t.router({
  questions: ownedFormProcedure.query(async ({ input }) => {
    return await inspectPrintPreparationQuestions(input.printFormId);
  }),
  list: printFormProcedure.query(async ({ ctx }) =>
    StaffPrintFormSchema.array().parse(
      await selectPrintFormsForUser({
        assessmentId: ctx.assessment.id,
        userId: ctx.locals.user.id,
      }),
    ),
  ),
  create: createForm,
  regenerate: ownedFormProcedure.mutation(async ({ ctx, signal }) => {
    if (ctx.assessment.team_work) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Creating print forms for group assessments is not supported yet.',
      });
    }
    try {
      const form = await createPrintForm({
        assessment: ctx.assessment,
        course: ctx.course,
        courseInstance: ctx.course_instance,
        userId: ctx.locals.user.id,
        authnUserId: ctx.authn_user.id,
        signal,
      });
      return { printFormId: form.id };
    } catch (error) {
      if (error instanceof HttpStatusError && error.status === 400) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: error.message, cause: error });
      }
      throw error;
    }
  }),
});
