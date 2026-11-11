import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';
import { IdSchema } from '@prairielearn/zod';

import { StaffPrintFormSchema } from '../../lib/client/safe-db-types.js';
import { features } from '../../lib/features/index.js';
import { createPrintForm } from '../../lib/printing/print-forms.js';
import { inspectPrintPreparationQuestions } from '../../lib/printing/print-preparation.js';
import {
  archivePrintForm,
  selectOptionalPrintForm,
  selectPrintFormsForAssessment,
} from '../../models/print-form.js';

import { type createContext, requireCoursePermissionPreview, t } from './init.js';

/** @knipignore Consumed by the preparation UI in the following PR. */
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

const rejectGroupWork = t.middleware(async ({ ctx, next }) => {
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

async function createForm({
  ctx,
  replacesPrintFormId,
}: {
  ctx: ReturnType<typeof createContext>;
  replacesPrintFormId?: string;
}) {
  try {
    const form = await createPrintForm({
      assessment: ctx.assessment,
      course: ctx.course,
      courseInstance: ctx.course_instance,
      userId: ctx.locals.user.id,
      authnUserId: ctx.authn_user.id,
      replacesPrintFormId,
    });
    return { printFormId: form.id, label: form.label };
  } catch (error) {
    if (error instanceof HttpStatusError) {
      if (error.status === 400) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: error.message, cause: error });
      }
      if (error.status === 404) {
        throw new TRPCError({ code: 'NOT_FOUND', message: error.message, cause: error });
      }
      if (error.status === 409) {
        throw new TRPCError({ code: 'CONFLICT', message: error.message, cause: error });
      }
    }
    throw error;
  }
}

export const printFormsRouter = t.router({
  questions: assessmentFormProcedure.query(async ({ input }) => {
    return await inspectPrintPreparationQuestions(input.printFormId);
  }),
  list: printFormProcedure.query(async ({ ctx }) =>
    StaffPrintFormSchema.array().parse(
      await selectPrintFormsForAssessment({ assessmentId: ctx.assessment.id }),
    ),
  ),
  create: printFormProcedure
    .use(rejectGroupWork)
    .mutation(async ({ ctx }) => await createForm({ ctx })),
  regenerate: assessmentFormProcedure
    .use(rejectGroupWork)
    .mutation(
      async ({ ctx, input }) => await createForm({ ctx, replacesPrintFormId: input.printFormId }),
    ),
  archive: assessmentFormProcedure.mutation(async ({ ctx, input }) => {
    const archived = await archivePrintForm({
      printFormId: input.printFormId,
      assessmentId: ctx.assessment.id,
    });
    if (!archived) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'This print form is no longer active.' });
    }
  }),
});
