import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { IdSchema } from '@prairielearn/zod';

import { makeAssessmentInstance } from '../../lib/assessment.js';
import { StaffAssessmentInstanceSchema } from '../../lib/client/safe-db-types.js';
import { features } from '../../lib/features/index.js';
import { inspectPrintPreparationQuestions } from '../../lib/print-preparation.js';
import { selectAssessmentInstancesForUser } from '../../models/assessment-instance.js';

import { requireCoursePermissionPreview, t } from './init.js';

export const requirePrintableAssessments = t.middleware(async (opts) => {
  if (!(await features.enabledFromLocals('printable-assessments', opts.ctx.locals))) {
    throw new TRPCError({ code: 'NOT_FOUND' });
  }
  return opts.next();
});

const printableAssessmentProcedure = t.procedure
  .use(requireCoursePermissionPreview)
  .use(requirePrintableAssessments);

const createInstanceProcedure = printableAssessmentProcedure.use(async ({ ctx, next }) => {
  if (ctx.assessment.team_work) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message:
        'Creating printable assessment instances for group assessments is not supported yet.',
    });
  }
  return next();
});

const ownedInstanceProcedure = printableAssessmentProcedure
  .input(z.object({ assessmentInstanceId: IdSchema }))
  .use(async ({ ctx, input, next }) => {
    const instances = await selectAssessmentInstancesForUser({
      assessment_id: ctx.assessment.id,
      user_id: ctx.locals.user.id,
    });
    if (!instances.some((instance) => instance.id === input.assessmentInstanceId)) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'This assessment instance is not available.',
      });
    }
    return next();
  });

export const printableAssessmentsRouter = t.router({
  questions: ownedInstanceProcedure.query(async ({ input }) => {
    return await inspectPrintPreparationQuestions(input.assessmentInstanceId);
  }),
  list: printableAssessmentProcedure.query(async ({ ctx }) =>
    StaffAssessmentInstanceSchema.array().parse(
      await selectAssessmentInstancesForUser({
        assessment_id: ctx.assessment.id,
        user_id: ctx.locals.user.id,
      }),
    ),
  ),
  create: createInstanceProcedure.mutation(async ({ ctx }) => {
    const assessmentInstanceId = await makeAssessmentInstance({
      assessment: ctx.assessment,
      user_id: ctx.locals.user.id,
      authn_user_id: ctx.authn_user.id,
      mode: 'Public',
      time_limit_min: null,
      date: new Date(),
      client_fingerprint_id: null,
      forPrinting: true,
    });
    return { assessmentInstanceId };
  }),
  regenerate: ownedInstanceProcedure.mutation(async ({ ctx }) => {
    if (ctx.assessment.team_work) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message:
          'Creating printable assessment instances for group assessments is not supported yet.',
      });
    }
    const assessmentInstanceId = await makeAssessmentInstance({
      assessment: ctx.assessment,
      user_id: ctx.locals.user.id,
      authn_user_id: ctx.authn_user.id,
      mode: 'Public',
      time_limit_min: null,
      date: new Date(),
      client_fingerprint_id: null,
      forPrinting: true,
    });
    return { assessmentInstanceId };
  }),
});
