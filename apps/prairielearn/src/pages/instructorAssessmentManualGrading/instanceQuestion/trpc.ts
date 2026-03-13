import { TRPCError, type inferRouterOutputs, initTRPC } from '@trpc/server';
import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import superjson from 'superjson';
import { z } from 'zod';

import { features } from '../../../lib/features/index.js';
import type { ResLocalsForPage } from '../../../lib/res-locals.js';

import {
  buildGradingContextPayload,
  buildRubricDataPayload,
  fetchSubmissionAndVariant,
} from './queries.js';

export function createContext({ res }: CreateExpressContextOptions) {
  const locals = res.locals as ResLocalsForPage<'instructor-instance-question'>;

  return {
    user: locals.authz_data.user,
    authn_user: locals.authz_data.authn_user,
    course: locals.course,
    course_instance: locals.course_instance,
    assessment: locals.assessment,
    assessment_instance: locals.assessment_instance,
    question: locals.question,
    assessment_question: locals.assessment_question,
    instance_question: locals.instance_question,
    urlPrefix: locals.urlPrefix,
    authz_data: locals.authz_data,
  };
}

type TRPCContext = Awaited<ReturnType<typeof createContext>>;

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
});

const viewerProcedure = t.procedure.use(async (opts) => {
  if (!opts.ctx.authz_data.has_course_instance_permission_view) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Access denied (must be a student data viewer)',
    });
  }
  return opts.next();
});

async function getAiGradingEnabled(ctx: TRPCContext): Promise<boolean> {
  return features.enabled('ai-grading', {
    institution_id: ctx.course.institution_id,
    course_id: ctx.course.id,
    course_instance_id: ctx.course_instance.id,
    user_id: ctx.authn_user.id,
  });
}

const rubricDataQuery = viewerProcedure.query(async (opts) => {
  const { assessment_question, instance_question } = opts.ctx;

  const submissionAndVariant = await fetchSubmissionAndVariant(instance_question.id);
  if (!submissionAndVariant) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Instance question does not have a gradable submission.',
    });
  }

  const aiGradingEnabled = await getAiGradingEnabled(opts.ctx);

  return buildRubricDataPayload({
    assessmentQuestion: assessment_question,
    instanceQuestion: instance_question,
    submissionAndVariant,
    aiGradingEnabled,
  });
});

const gradingContextQuery = viewerProcedure
  .input(z.object({ conflictGradingJobId: z.string().nullish() }).optional())
  .query(async (opts) => {
    const {
      course,
      course_instance,
      assessment,
      assessment_instance,
      question,
      assessment_question,
      instance_question,
      authz_data,
    } = opts.ctx;

    const submissionAndVariant = await fetchSubmissionAndVariant(instance_question.id);
    if (!submissionAndVariant) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Instance question does not have a gradable submission.',
      });
    }

    const aiGradingEnabled = await getAiGradingEnabled(opts.ctx);

    return buildGradingContextPayload({
      course,
      courseInstance: course_instance,
      assessment,
      assessmentInstance: assessment_instance,
      question,
      assessmentQuestion: assessment_question,
      instanceQuestion: instance_question,
      authzData: authz_data,
      submissionAndVariant,
      aiGradingEnabled,
      conflictGradingJobId: opts.input?.conflictGradingJobId,
    });
  });

export const manualGradingInstanceQuestionRouter = t.router({
  rubricData: rubricDataQuery,
  gradingContext: gradingContextQuery,
});

export type ManualGradingInstanceQuestionRouter = typeof manualGradingInstanceQuestionRouter;

type RouterOutputs = inferRouterOutputs<ManualGradingInstanceQuestionRouter>;
export type RubricQueryData = RouterOutputs['rubricData'];
export type GradingContextData = RouterOutputs['gradingContext'];
