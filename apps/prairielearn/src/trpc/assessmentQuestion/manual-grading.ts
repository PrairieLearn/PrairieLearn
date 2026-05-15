import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { run } from '@prairielearn/run';
import { IdSchema } from '@prairielearn/zod';

import {
  AI_GRADING_MODEL_IDS,
  type AiGradingModelId,
} from '../../ee/lib/ai-grading/ai-grading-models.shared.js';
import { fillInstanceQuestionColumnEntries } from '../../ee/lib/ai-grading/ai-grading-stats.js';
import {
  deleteAiGradingJobs,
  hasPriorAiGradingJobs,
  setAiGradingLastSelectedModel,
  setAiGradingMode,
} from '../../ee/lib/ai-grading/ai-grading-util.js';
import {
  MAX_CONCURRENT_AI_GRADING_JOBS_PER_COURSE_INSTANCE,
  aiGrade,
  getActiveAiGradingJobCountForCourseInstance,
} from '../../ee/lib/ai-grading/ai-grading.js';
import { MAX_FREE_AI_GRADING_CREDIT_REDEMPTIONS_PER_COURSE } from '../../ee/lib/ai-grading-free-credit-constants.js';
import { deleteAiInstanceQuestionGroups } from '../../ee/lib/ai-instance-question-grouping/ai-instance-question-grouping-util.js';
import { aiInstanceQuestionGrouping } from '../../ee/lib/ai-instance-question-grouping/ai-instance-question-grouping.js';
import {
  FreeCreditRedemptionCapReachedError,
  redeemFreeAiGradingCredit,
  selectCourseFreeCreditRedemptionsUsed,
} from '../../ee/models/ai-grading-free-credit-redemption.js';
import { features } from '../../lib/features/index.js';
import { generateJobSequenceToken } from '../../lib/generateJobSequenceToken.js';
import { idsEqual } from '../../lib/id.js';
import { stopJobSequence } from '../../lib/server-jobs.js';
import { selectCreditPool } from '../../models/ai-grading-credit-pool.js';
import { selectCourseInstanceGraderStaff } from '../../models/course-instances.js';
import { InstanceQuestionRowWithAIGradingStatsSchema } from '../../pages/instructorAssessmentManualGrading/assessmentQuestion/assessmentQuestion.types.js';
import {
  selectInstanceQuestionsForManualGrading,
  updateInstanceQuestions,
} from '../../pages/instructorAssessmentManualGrading/assessmentQuestion/queries.js';

import {
  requireCourseInstancePermissionEdit,
  requireCourseInstancePermissionView,
  t,
} from './init.js';

export interface ManualGradingError {
  Instances: never;
  AiGradingAvailabilityInfo: never;
  SetAiGradingMode: never;
  DeleteAiGradingJobs: never;
  DeleteAiInstanceQuestionGroupings: never;
  AiGroupInstanceQuestions: never;
  AiGradeInstanceQuestions: never;
  SetAssignedGrader: never;
  SetRequiresManualGrading: never;
  RedeemFreeCredit: never;
}

const requireAiGradingFeature = t.middleware(async (opts) => {
  const enabled = await features.enabled('ai-grading', {
    institution_id: opts.ctx.course.institution_id,
    course_id: opts.ctx.course.id,
    course_instance_id: opts.ctx.course_instance.id,
    user_id: opts.ctx.authn_user.id,
  });

  if (!enabled) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Access denied (feature not available)',
    });
  }
  return opts.next();
});

const instances = t.procedure
  .use(requireCourseInstancePermissionView)
  .output(z.array(InstanceQuestionRowWithAIGradingStatsSchema))
  .query(async (opts) => {
    const instance_questions = await selectInstanceQuestionsForManualGrading({
      assessment: opts.ctx.assessment,
      assessment_question: opts.ctx.assessment_question,
    });

    return await fillInstanceQuestionColumnEntries(
      instance_questions,
      opts.ctx.assessment_question,
    );
  });

const setAiGradingModeMutation = t.procedure
  .use(requireCourseInstancePermissionEdit)
  .use(requireAiGradingFeature)
  .input(z.object({ enabled: z.boolean() }))
  .mutation(async (opts) => {
    await setAiGradingMode(opts.ctx.assessment_question.id, opts.input.enabled);
  });

const deleteAiGradingJobsMutation = t.procedure
  .use(requireCourseInstancePermissionEdit)
  .use(requireAiGradingFeature)
  .output(z.object({ num_deleted: z.number() }))
  .mutation(async (opts) => {
    const iqs = await deleteAiGradingJobs({
      assessment_question_ids: [opts.ctx.assessment_question.id],
      authn_user_id: opts.ctx.authn_user.id,
    });

    return { num_deleted: iqs.length };
  });

const deleteAiInstanceQuestionGroupingsMutation = t.procedure
  .use(requireCourseInstancePermissionEdit)
  .use(requireAiGradingFeature)
  .output(z.object({ num_deleted: z.number() }))
  .mutation(async (opts) => {
    const num_deleted = await deleteAiInstanceQuestionGroups({
      assessment_question_id: opts.ctx.assessment_question.id,
    });

    return { num_deleted };
  });

const aiGroupInstanceQuestionsMutation = t.procedure
  .use(requireCourseInstancePermissionEdit)
  .use(requireAiGradingFeature)
  .input(
    z.object({
      selection: z.union([z.literal('all'), z.literal('ungrouped'), z.string().array()]),
      closed_instance_questions_only: z.boolean(),
    }),
  )
  .output(z.object({ job_sequence_id: z.string(), job_sequence_token: z.string() }))
  .mutation(async (opts) => {
    const job_sequence_id = await aiInstanceQuestionGrouping({
      question: opts.ctx.question,
      course: opts.ctx.course,
      course_instance: opts.ctx.course_instance,
      assessment_question: opts.ctx.assessment_question,
      urlPrefix: opts.ctx.urlPrefix,
      authn_user_id: opts.ctx.authn_user.id,
      user_id: opts.ctx.user.id,
      closed_instance_questions_only: opts.input.closed_instance_questions_only,
      ungrouped_instance_questions_only: opts.input.selection === 'ungrouped',
      instance_question_ids: run(() => {
        if (!Array.isArray(opts.input.selection)) return undefined;
        return opts.input.selection;
      }),
    });
    const job_sequence_token = generateJobSequenceToken(job_sequence_id);
    return { job_sequence_id, job_sequence_token };
  });

const aiGradeInstanceQuestionsMutation = t.procedure
  .use(requireCourseInstancePermissionEdit)
  .use(requireAiGradingFeature)
  .input(
    z.object({
      selection: z.union([z.literal('all'), z.literal('human_graded'), z.string().array()]),
      model_id: z.enum(AI_GRADING_MODEL_IDS as [AiGradingModelId, ...AiGradingModelId[]]),
    }),
  )
  .output(z.object({ job_sequence_id: z.string(), job_sequence_token: z.string() }))
  .mutation(async (opts) => {
    await setAiGradingLastSelectedModel(opts.ctx.assessment_question.id, opts.input.model_id);
    const job_sequence_id = await aiGrade({
      question: opts.ctx.question,
      course: opts.ctx.course,
      course_instance: opts.ctx.course_instance,
      assessment: opts.ctx.assessment,
      assessment_question: opts.ctx.assessment_question,
      urlPrefix: opts.ctx.urlPrefix,
      authn_user_id: opts.ctx.authn_user.id,
      user_id: opts.ctx.user.id,
      model_id: opts.input.model_id,
      mode: run(() => {
        if (Array.isArray(opts.input.selection)) return 'selected';
        return opts.input.selection;
      }),
      instance_question_ids: run(() => {
        if (!Array.isArray(opts.input.selection)) return undefined;
        return opts.input.selection;
      }),
    });
    const job_sequence_token = generateJobSequenceToken(job_sequence_id);
    return { job_sequence_id, job_sequence_token };
  });

const stopAiGradingJobMutation = t.procedure
  .use(requireCourseInstancePermissionEdit)
  .use(requireAiGradingFeature)
  .input(z.object({ job_sequence_id: IdSchema }))
  .mutation(async (opts) => {
    const stopped = await stopJobSequence({
      job_sequence_id: opts.input.job_sequence_id,
      assessment_question_id: opts.ctx.assessment_question.id,
      authn_user_id: opts.ctx.authn_user.id,
      type: 'ai_grading',
    });
    if (!stopped) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: 'AI grading job is no longer running.',
      });
    }
  });

const setAssignedGraderMutation = t.procedure
  .use(requireCourseInstancePermissionEdit)
  .input(
    z.object({ assigned_grader: z.string().nullable(), instance_question_ids: z.string().array() }),
  )
  .mutation(async (opts) => {
    const assigned_grader = opts.input.assigned_grader;
    if (assigned_grader !== null) {
      const courseStaff = await selectCourseInstanceGraderStaff({
        courseInstance: opts.ctx.course_instance,
        requiredRole: ['Student Data Editor'],
        authzData: opts.ctx.authz_data,
      });
      if (!courseStaff.some((staff) => idsEqual(staff.id, assigned_grader))) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'The assigned grader does not have Student Data Editor permission.',
        });
      }
    }

    await updateInstanceQuestions({
      assessment_question: opts.ctx.assessment_question,
      instance_question_ids: opts.input.instance_question_ids,
      update_requires_manual_grading: false,
      requires_manual_grading: null,
      update_assigned_grader: true,
      assigned_grader,
    });
  });

const setRequiresManualGradingMutation = t.procedure
  .use(requireCourseInstancePermissionEdit)
  .input(
    z.object({
      requires_manual_grading: z.boolean(),
      instance_question_ids: z.string().array(),
    }),
  )
  .mutation(async (opts) => {
    await updateInstanceQuestions({
      assessment_question: opts.ctx.assessment_question,
      instance_question_ids: opts.input.instance_question_ids,
      update_requires_manual_grading: true,
      requires_manual_grading: opts.input.requires_manual_grading,
      update_assigned_grader: false,
      assigned_grader: null,
    });
  });

const aiGradingAvailabilityInfo = t.procedure
  .use(requireCourseInstancePermissionView)
  .use(requireAiGradingFeature)
  .output(
    z.object({
      running_job_count: z.number(),
      max_concurrent_jobs: z.number(),
      credit_balance_milli_dollars: z.number(),
      free_credit_redemptions_remaining: z.number(),
      has_prior_jobs: z.boolean(),
    }),
  )
  .query(async (opts) => {
    const [running_job_count, creditPool, freeCreditRedemptionsUsed, has_prior_jobs] =
      await Promise.all([
        getActiveAiGradingJobCountForCourseInstance(opts.ctx.course_instance.id),
        selectCreditPool(opts.ctx.course_instance.id),
        selectCourseFreeCreditRedemptionsUsed(opts.ctx.course.id),
        hasPriorAiGradingJobs(opts.ctx.assessment_question.id),
      ]);
    return {
      running_job_count,
      max_concurrent_jobs: MAX_CONCURRENT_AI_GRADING_JOBS_PER_COURSE_INSTANCE,
      credit_balance_milli_dollars: creditPool.total_milli_dollars,
      free_credit_redemptions_remaining: Math.max(
        0,
        MAX_FREE_AI_GRADING_CREDIT_REDEMPTIONS_PER_COURSE - freeCreditRedemptionsUsed,
      ),
      has_prior_jobs,
    };
  });

const redeemFreeCreditMutation = t.procedure
  .use(requireCourseInstancePermissionEdit)
  .use(requireAiGradingFeature)
  .output(
    z.object({
      redemptions_used: z.number(),
      redemptions_remaining: z.number(),
      amount_milli_dollars: z.number(),
    }),
  )
  .mutation(async (opts) => {
    try {
      return await redeemFreeAiGradingCredit({
        course_id: opts.ctx.course.id,
        course_instance_id: opts.ctx.course_instance.id,
        user_id: opts.ctx.authn_user.id,
      });
    } catch (err) {
      if (err instanceof FreeCreditRedemptionCapReachedError) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: err.message });
      }
      throw err;
    }
  });

export const manualGradingRouter = t.router({
  instances,
  aiGradingAvailabilityInfo,
  setAiGradingMode: setAiGradingModeMutation,
  deleteAiGradingJobs: deleteAiGradingJobsMutation,
  deleteAiInstanceQuestionGroupings: deleteAiInstanceQuestionGroupingsMutation,
  aiGroupInstanceQuestions: aiGroupInstanceQuestionsMutation,
  aiGradeInstanceQuestions: aiGradeInstanceQuestionsMutation,
  stopAiGradingJob: stopAiGradingJobMutation,
  setAssignedGrader: setAssignedGraderMutation,
  setRequiresManualGrading: setRequiresManualGradingMutation,
  redeemFreeCredit: redeemFreeCreditMutation,
});
