import { TRPCError, initTRPC } from '@trpc/server';
import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import superjson from 'superjson';
import { z } from 'zod';

import { run } from '@prairielearn/run';

import {
  AI_GRADING_MODEL_IDS,
  type AiGradingModelId,
  DEFAULT_AI_GRADING_MODEL,
} from '../../../ee/lib/ai-grading/ai-grading-models.shared.js';
import { fillInstanceQuestionColumnEntries } from '../../../ee/lib/ai-grading/ai-grading-stats.js';
import {
  deleteAiGradingJobs,
  setAiGradingMode,
} from '../../../ee/lib/ai-grading/ai-grading-util.js';
import { aiGrade } from '../../../ee/lib/ai-grading/ai-grading.js';
import { deleteAiInstanceQuestionGroups } from '../../../ee/lib/ai-instance-question-grouping/ai-instance-question-grouping-util.js';
import { aiInstanceQuestionGrouping } from '../../../ee/lib/ai-instance-question-grouping/ai-instance-question-grouping.js';
import { features } from '../../../lib/features/index.js';
import { generateJobSequenceToken } from '../../../lib/generateJobSequenceToken.js';
import { idsEqual } from '../../../lib/id.js';
import type { ResLocalsForPage } from '../../../lib/res-locals.js';
import { selectCourseInstanceGraderStaff } from '../../../models/course-instances.js';

import { InstanceQuestionRowWithAIGradingStatsSchema } from './assessmentQuestion.types.js';
import { selectInstanceQuestionsForManualGrading, updateInstanceQuestions } from './queries.js';

export function createContext({ res }: CreateExpressContextOptions) {
  const locals = res.locals as ResLocalsForPage<'instructor-assessment-question'>;

  return {
    user: locals.authz_data.user,
    authn_user: locals.authz_data.authn_user,
    course: locals.course,
    course_instance: locals.course_instance,
    assessment: locals.assessment,
    question: locals.question,
    assessment_question: locals.assessment_question,
    urlPrefix: locals.urlPrefix,
    authz_data: locals.authz_data,
  };
}

type TRPCContext = Awaited<ReturnType<typeof createContext>>;

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
});

/**
 * Middleware that checks if the user has course instance edit permission.
 * Required for all mutations that modify data.
 */
const requireCourseInstancePermissionEdit = t.middleware(async (opts) => {
  if (!opts.ctx.authz_data.has_course_instance_permission_edit) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Access denied (must be a student data editor)',
    });
  }
  return opts.next();
});

/**
 * Middleware that checks if the AI grading feature is enabled.
 */
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

const instancesQuery = t.procedure
  .output(z.array(InstanceQuestionRowWithAIGradingStatsSchema))
  .query(async (opts) => {
    if (!opts.ctx.authz_data.has_course_instance_permission_view) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Access denied (must be a student data viewer)',
      });
    }

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
      course_instance_id: opts.ctx.course_instance.id,
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

const aiGradeInstanceQuestionMutation = t.procedure
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
    const aiGradingModelSelectionEnabled = await features.enabled('ai-grading-model-selection', {
      institution_id: opts.ctx.course.institution_id,
      course_id: opts.ctx.course.id,
      course_instance_id: opts.ctx.course_instance.id,
      user_id: opts.ctx.authn_user.id,
    });

    if (!aiGradingModelSelectionEnabled && opts.input.model_id !== DEFAULT_AI_GRADING_MODEL) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `AI grading model selection not available. Must use default model: ${DEFAULT_AI_GRADING_MODEL}`,
      });
    }

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
          message: 'Assigned grader does not have Student Data Editor permission',
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

export const manualGradingAssessmentQuestionRouter = t.router({
  instances: instancesQuery,
  setAiGradingMode: setAiGradingModeMutation,
  deleteAiGradingJobs: deleteAiGradingJobsMutation,
  deleteAiInstanceQuestionGroupings: deleteAiInstanceQuestionGroupingsMutation,
  aiGroupInstanceQuestions: aiGroupInstanceQuestionsMutation,
  aiGradeInstanceQuestions: aiGradeInstanceQuestionMutation,
  setAssignedGrader: setAssignedGraderMutation,
  setRequiresManualGrading: setRequiresManualGradingMutation,
});

export type ManualGradingAssessmentQuestionRouter = typeof manualGradingAssessmentQuestionRouter;
