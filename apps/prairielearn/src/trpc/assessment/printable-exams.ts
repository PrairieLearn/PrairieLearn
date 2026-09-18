import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { IdSchema } from '@prairielearn/zod';

import { makeAssessmentInstance } from '../../lib/assessment.js';
import { StaffAssessmentInstanceSchema } from '../../lib/client/safe-db-types.js';
import { inspectPrintPreparationQuestions } from '../../lib/print-preparation.js';
import { selectAssessmentInstancesForUser } from '../../models/assessment-instance.js';

import { requireCoursePermissionPreview, t } from './init.js';

export interface PrintableExamsError {
  list: never;
  create: never;
  questions: never;
}

const printableExamProcedure = t.procedure
  .use(requireCoursePermissionPreview)
  .use(async ({ ctx, next }) => {
    if (ctx.assessment.type !== 'Exam') {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Only exams can be printed.' });
    }
    return next();
  });

export const printableExamsRouter = t.router({
  questions: printableExamProcedure
    .input(z.object({ assessmentInstanceId: IdSchema }))
    .query(async ({ ctx, input }) => {
      const instances = await selectAssessmentInstancesForUser({
        assessment_id: ctx.assessment.id,
        user_id: ctx.locals.user.id,
      });
      if (!instances.some((instance) => instance.id === input.assessmentInstanceId)) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'This exam form is not available.' });
      }
      return await inspectPrintPreparationQuestions(input.assessmentInstanceId);
    }),
  list: printableExamProcedure.query(async ({ ctx }) =>
    StaffAssessmentInstanceSchema.array().parse(
      await selectAssessmentInstancesForUser({
        assessment_id: ctx.assessment.id,
        user_id: ctx.locals.user.id,
      }),
    ),
  ),
  create: printableExamProcedure.mutation(async ({ ctx }) => {
    if (ctx.assessment.team_work) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Creating printable forms for group exams is not supported yet.',
      });
    }
    const assessmentInstanceId = await makeAssessmentInstance({
      assessment: ctx.assessment,
      user_id: ctx.locals.user.id,
      authn_user_id: ctx.authn_user.id,
      mode: 'Public',
      time_limit_min: null,
      date: ctx.locals.req_date,
      client_fingerprint_id: null,
    });
    return { assessmentInstanceId };
  }),
});
