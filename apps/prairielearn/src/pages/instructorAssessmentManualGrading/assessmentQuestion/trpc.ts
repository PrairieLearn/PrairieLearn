import { TRPCError, initTRPC } from '@trpc/server';
import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import { z } from 'zod';

import { run } from '@prairielearn/run';

import {
  deleteAiGradingJobs,
  setAiGradingMode,
} from '../../../ee/lib/ai-grading/ai-grading-util.js';
import { deleteAiInstanceQuestionGroups } from '../../../ee/lib/ai-instance-question-grouping/ai-instance-question-grouping-util.js';
import { aiInstanceQuestionGrouping } from '../../../ee/lib/ai-instance-question-grouping/ai-instance-question-grouping.js';
import { extractPageContext } from '../../../lib/client/page-context.js';
import type { Course } from '../../../lib/db-types.js';
import { features } from '../../../lib/features/index.js';

export function createContext({ res }: CreateExpressContextOptions) {
  const pageContext = extractPageContext(res.locals, {
    pageType: 'assessmentQuestion',
    accessType: 'instructor',
  });

  return {
    user: pageContext.authz_data.user,
    authn_user: pageContext.authz_data.authn_user,
    course: pageContext.course,
    course_instance: pageContext.course_instance,
    question: pageContext.question,
    assessment_question: pageContext.assessment_question,
    locals: res.locals,
  };
}

export type TRPCContext = Awaited<ReturnType<typeof createContext>>;

export const t = initTRPC.context<TRPCContext>().create();

const setAiGradingModeMutation = t.procedure
  .input(z.object({ enabled: z.boolean() }))
  .mutation(async (opts) => {
    if (!(await features.enabledFromLocals('ai-grading', opts.ctx.locals))) {
      throw new TRPCError({ message: 'Access denied (feature not available)', code: 'FORBIDDEN' });
    }

    await setAiGradingMode(opts.ctx.assessment_question.id, opts.input.enabled);
  });

const deleteAiGradingJobsMutation = t.procedure
  .output(z.object({ num_deleted: z.number() }))
  .mutation(async (opts) => {
    if (!(await features.enabledFromLocals('ai-grading', opts.ctx.locals))) {
      throw new TRPCError({ message: 'Access denied (feature not available)', code: 'FORBIDDEN' });
    }

    const iqs = await deleteAiGradingJobs({
      assessment_question_ids: [opts.ctx.assessment_question.id],
      authn_user_id: opts.ctx.authn_user.user_id,
    });

    return { num_deleted: iqs.length };
  });

const deleteAiInstanceQuestionGroupingsMutation = t.procedure
  .output(z.object({ num_deleted: z.number() }))
  .mutation(async (opts) => {
    if (!(await features.enabledFromLocals('ai-grading', opts.ctx.locals))) {
      throw new TRPCError({ message: 'Access denied (feature not available)', code: 'FORBIDDEN' });
    }

    const num_deleted = await deleteAiInstanceQuestionGroups({
      assessment_question_id: opts.ctx.assessment_question.id,
    });

    return { num_deleted };
  });

const aiInstanceQuestionGroupMutation = t.procedure
  .input(
    z.object({
      selection: z.union([z.literal('all'), z.literal('ungrouped'), z.string().array()]),
      closed_instance_questions_only: z.boolean(),
    }),
  )
  .output(z.object({ job_sequence_id: z.string() }))
  .mutation(async (opts) => {
    const job_sequence_id = await aiInstanceQuestionGrouping({
      question: opts.ctx.question,
      // TODO: what to do about this?
      course: opts.ctx.course as unknown as Course,
      course_instance_id: opts.ctx.course_instance.id,
      assessment_question: opts.ctx.assessment_question,
      urlPrefix: '...',
      authn_user_id: opts.ctx.authn_user.user_id,
      user_id: opts.ctx.user.user_id,
      closed_instance_questions_only: opts.input.closed_instance_questions_only,
      ungrouped_instance_questions_only: opts.input.selection === 'ungrouped',
      instance_question_ids: run(() => {
        if (!Array.isArray(opts.input.selection)) return undefined;
        return opts.input.selection;
      }),
    });
    return { job_sequence_id };
  });

export const manualGradingAssessmentQuestionRouter = t.router({
  setAiGradingMode: setAiGradingModeMutation,
  deleteAiGradingJobs: deleteAiGradingJobsMutation,
  deleteAiInstanceQuestionGroupings: deleteAiInstanceQuestionGroupingsMutation,
  aiInstanceQuestionGroup: aiInstanceQuestionGroupMutation,
});

export type ManualGradingAssessmentQuestionRouter = typeof manualGradingAssessmentQuestionRouter;
