import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';
import { IdSchema } from '@prairielearn/zod';

import { MAX_ACTIVE_PRINT_FORMS } from '../../lib/client/printing/print-form-limits.js';
import {
  StaffPrintFormSchema,
  StaffPrintPreparationFormSchema,
} from '../../lib/client/safe-db-types.js';
import { features } from '../../lib/features/index.js';
import { PAPER_SIZES } from '../../lib/printing/paper-size.js';
import {
  archivePrintFormIfOtherActive,
  createPrintForm,
  ensureInitialPrintForm,
  revisePrintFormSelection,
  setPrintFormPaperSize,
} from '../../lib/printing/print-forms.js';
import {
  inspectPrintPreparationQuestions,
  selectPrintPreparationForms,
} from '../../lib/printing/print-preparation.js';
import { type PrintSettings, PrintSettingsSchema } from '../../lib/printing/print-settings.js';
import { selectOptionalPrintForm, updatePrintFormSettings } from '../../models/print-form.js';

import {
  type createContext,
  requireCoursePermissionEdit,
  requireCoursePermissionPreview,
  t,
} from './init.js';

export interface PrintFormsError {
  archive: never;
  questions: never;
  list: never;
  create: never;
  ensureInitial: never;
  regenerate: never;
  reviseSelection: never;
  setPaperSize: never;
  updateSettings: never;
}

export const requirePrintingAvailable = t.middleware(async (opts) => {
  // Everyone has preview access to example courses, so shared print forms there would be one
  // pool that any user could fill or regenerate.
  if (
    opts.ctx.course.example_course ||
    !(await features.enabledFromLocals('printable-assessments', opts.ctx.locals))
  ) {
    throw new TRPCError({ code: 'NOT_FOUND' });
  }
  return opts.next();
});

const printFormProcedure = t.procedure
  .use(requireCoursePermissionPreview)
  .use(requirePrintingAvailable);
const editorPrintFormProcedure = printFormProcedure.use(requireCoursePermissionEdit);

const rejectGroupWork = t.middleware(async ({ ctx, next }) => {
  if (ctx.assessment.team_work) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Printing group assessments is not available yet.',
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
    return next({ ctx: { printForm: form } });
  });
const editorAssessmentFormProcedure = assessmentFormProcedure.use(requireCoursePermissionEdit);

function rethrowPrintFormError(error: unknown): never {
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

async function createForm({
  ctx,
  replacesPrintFormId,
  sourcePrintFormId,
  settings,
  ensureInitial = false,
}: {
  ctx: ReturnType<typeof createContext>;
  replacesPrintFormId?: string;
  sourcePrintFormId?: string;
  settings?: PrintSettings;
  ensureInitial?: boolean;
}) {
  try {
    const options = {
      assessment: ctx.assessment,
      course: ctx.course,
      courseInstance: ctx.course_instance,
      userId: ctx.locals.user.id,
      authnUserId: ctx.authn_user.id,
    };
    const form = ensureInitial
      ? await ensureInitialPrintForm(options)
      : await createPrintForm({ ...options, replacesPrintFormId, sourcePrintFormId, settings });
    return {
      printFormId: form.id,
      label: form.label,
      settings: PrintSettingsSchema.parse(form.settings),
    };
  } catch (error) {
    rethrowPrintFormError(error);
  }
}

export const printFormsRouter = t.router({
  questions: assessmentFormProcedure.query(async ({ input }) => {
    return await inspectPrintPreparationQuestions(input.printFormId);
  }),
  list: printFormProcedure.query(async ({ ctx }) =>
    StaffPrintPreparationFormSchema.array().parse(
      await selectPrintPreparationForms(ctx.assessment.id),
    ),
  ),
  create: editorPrintFormProcedure
    .use(rejectGroupWork)
    .input(
      z
        .object({ settings: PrintSettingsSchema, sourcePrintFormId: IdSchema.optional() })
        .optional(),
    )
    .mutation(
      async ({ ctx, input }) =>
        await createForm({
          ctx,
          settings: input?.settings,
          sourcePrintFormId: input?.sourcePrintFormId,
        }),
    ),
  ensureInitial: editorPrintFormProcedure
    .use(rejectGroupWork)
    .mutation(async ({ ctx }) => await createForm({ ctx, ensureInitial: true })),
  regenerate: editorAssessmentFormProcedure
    .use(rejectGroupWork)
    .mutation(
      async ({ ctx, input }) => await createForm({ ctx, replacesPrintFormId: input.printFormId }),
    ),
  reviseSelection: editorAssessmentFormProcedure
    .use(rejectGroupWork)
    .input(z.object({ questionNumber: z.string().min(1), included: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const form = await revisePrintFormSelection({
          assessment: ctx.assessment,
          userId: ctx.locals.user.id,
          authnUserId: ctx.authn_user.id,
          printFormId: input.printFormId,
          questionNumber: input.questionNumber,
          included: input.included,
        });
        return {
          printFormId: form.id,
          label: form.label,
          settings: PrintSettingsSchema.parse(form.settings),
        };
      } catch (error) {
        rethrowPrintFormError(error);
      }
    }),
  setPaperSize: editorAssessmentFormProcedure
    .use(rejectGroupWork)
    .input(
      z.object({
        paperSize: z.enum(PAPER_SIZES),
        expectedForms: z
          .array(z.object({ id: IdSchema, paperSize: z.enum(PAPER_SIZES), locked: z.boolean() }))
          .min(1)
          .max(MAX_ACTIVE_PRINT_FORMS),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const result = await setPrintFormPaperSize({
          assessment: ctx.assessment,
          userId: ctx.locals.user.id,
          authnUserId: ctx.authn_user.id,
          printFormId: input.printFormId,
          paperSize: input.paperSize,
          expectedForms: input.expectedForms,
        });
        return {
          replacements: result.replacements.map((form) => ({
            ...form,
            settings: PrintSettingsSchema.parse(form.settings),
          })),
        };
      } catch (error) {
        rethrowPrintFormError(error);
      }
    }),
  archive: editorAssessmentFormProcedure.mutation(async ({ ctx, input }) => {
    try {
      await archivePrintFormIfOtherActive({
        printFormId: input.printFormId,
        assessmentId: ctx.assessment.id,
      });
    } catch (error) {
      rethrowPrintFormError(error);
    }
  }),
  updateSettings: editorAssessmentFormProcedure
    .input(z.object({ settings: PrintSettingsSchema, expectedSettings: PrintSettingsSchema }))
    .mutation(async ({ ctx, input }) => {
      try {
        const form = await updatePrintFormSettings({
          printFormId: input.printFormId,
          assessmentId: ctx.assessment.id,
          settings: input.settings,
          expectedSettings: input.expectedSettings,
        });
        if (!form) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'This print form is no longer active.',
          });
        }
        return StaffPrintFormSchema.parse(form);
      } catch (error) {
        rethrowPrintFormError(error);
      }
    }),
});
