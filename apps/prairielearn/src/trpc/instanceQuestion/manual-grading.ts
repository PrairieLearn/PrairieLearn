import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { features } from '../../lib/features/index.js';
import {
  buildGradingContextPayload,
  buildRubricDataPayload,
  fetchSubmissionAndVariant,
} from '../../pages/instructorAssessmentManualGrading/instanceQuestion/queries.js';

import { type TRPCContext, requireCourseInstancePermissionView, t } from './init.js';

async function getAiGradingEnabled(ctx: TRPCContext): Promise<boolean> {
  return features.enabled('ai-grading', {
    institution_id: ctx.course.institution_id,
    course_id: ctx.course.id,
    course_instance_id: ctx.course_instance.id,
    user_id: ctx.authn_user.id,
  });
}

const viewerProcedure = t.procedure.use(requireCourseInstancePermissionView);

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

export const manualGradingRouter = t.router({
  rubricData: rubricDataQuery,
  gradingContext: gradingContextQuery,
});
