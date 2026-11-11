import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';
import { IdSchema } from '@prairielearn/zod';

import { StaffPrintFormSchema } from '../../lib/client/safe-db-types.js';
import { features } from '../../lib/features/index.js';
import { inspectPrintPreparationQuestions } from '../../lib/print-preparation.js';
import { createPrintForm } from '../../lib/printing/print-forms.js';
import {
  archivePrintForm,
  selectOptionalPrintForm,
  selectPrintFormsForAssessment,
} from '../../models/print-form.js';

import { requireCoursePermissionPreview, t } from './init.js';

export interface PrintFormsError {
  archive: never;
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

const assessmentFormProcedure = printFormProcedure
  .input(z.object({ printFormId: IdSchema }))
  .use(async ({ ctx, input, next }) => {
    const form = await selectOptionalPrintForm({
      printFormId: input.printFormId,
      assessmentId: ctx.assessment.id,
    });
    if (!form) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'This print form is not available.' });
    }
    return next();
  });

const createForm = createFormProcedure.mutation(async ({ ctx }) => {
  try {
    const form = await createPrintForm({
      assessment: ctx.assessment,
      course: ctx.course,
      courseInstance: ctx.course_instance,
      userId: ctx.locals.user.id,
      authnUserId: ctx.authn_user.id,
    });
    return { printFormId: form.id, label: form.label };
  } catch (error) {
    if (error instanceof HttpStatusError && error.status === 400) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: error.message, cause: error });
    }
    throw error;
  }
});

export const printFormsRouter = t.router({
  questions: assessmentFormProcedure.query(async ({ input }) => {
    return await inspectPrintPreparationQuestions(input.printFormId);
  }),
  list: printFormProcedure.query(async ({ ctx }) =>
    StaffPrintFormSchema.array().parse(
      await selectPrintFormsForAssessment({ assessmentId: ctx.assessment.id }),
    ),
  ),
  create: createForm,
  regenerate: assessmentFormProcedure.mutation(async ({ ctx, input }) => {
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
        replacesPrintFormId: input.printFormId,
      });
      return { printFormId: form.id, label: form.label };
    } catch (error) {
      if (error instanceof HttpStatusError && (error.status === 400 || error.status === 404)) {
        throw new TRPCError({
          code: error.status === 404 ? 'NOT_FOUND' : 'BAD_REQUEST',
          message: error.message,
          cause: error,
        });
      }
      throw error;
    }
  }),
  archive: assessmentFormProcedure.mutation(async ({ ctx, input }) => {
    const form = await archivePrintForm({
      printFormId: input.printFormId,
      assessmentId: ctx.assessment.id,
    });
    if (!form) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'This print form is not available.' });
    }
  }),
});
