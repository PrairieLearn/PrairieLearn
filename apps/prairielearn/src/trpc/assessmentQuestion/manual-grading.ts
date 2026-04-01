import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { run } from '@prairielearn/run';

import {
  AI_GRADING_MODEL_IDS,
  type AiGradingModelId,
  DEFAULT_AI_GRADING_MODEL,
} from '../../ee/lib/ai-grading/ai-grading-models.shared.js';
import {
  calculateAiGradingStats,
  fillInstanceQuestionColumnEntries,
} from '../../ee/lib/ai-grading/ai-grading-stats.js';
import { deleteAiGradingJobs, setAiGradingMode } from '../../ee/lib/ai-grading/ai-grading-util.js';
import { aiGrade } from '../../ee/lib/ai-grading/ai-grading.js';
import { deleteAiInstanceQuestionGroups } from '../../ee/lib/ai-instance-question-grouping/ai-instance-question-grouping-util.js';
import { aiInstanceQuestionGrouping } from '../../ee/lib/ai-instance-question-grouping/ai-instance-question-grouping.js';
import { features } from '../../lib/features/index.js';
import { generateJobSequenceToken } from '../../lib/generateJobSequenceToken.js';
import { idsEqual } from '../../lib/id.js';
import * as manualGrading from '../../lib/manualGrading.js';
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

export interface ManualGradingError {}

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
    const aiGradingModelSelectionEnabled = await features.enabled('ai-grading-model-selection', {
      institution_id: opts.ctx.course.institution_id,
      course_id: opts.ctx.course.id,
      course_instance_id: opts.ctx.course_instance.id,
      user_id: opts.ctx.authn_user.id,
    });

    if (!aiGradingModelSelectionEnabled && opts.input.model_id !== DEFAULT_AI_GRADING_MODEL) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'AI grading model selection is not available. The default model must be used.',
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

// TODO: This mutation duplicates the one in trpc/instanceQuestion/manual-grading.ts.
// Extract the shared logic into a helper so both routers call the same implementation.
const modifyRubricSettingsMutation = t.procedure
  .use(requireCourseInstancePermissionEdit)
  .input(
    z.object({
      useRubric: z.boolean(),
      replaceAutoPoints: z.boolean(),
      startingPoints: z.number(),
      minPoints: z.number(),
      maxExtraPoints: z.number(),
      tagForManualGrading: z.boolean().default(false),
      graderGuidelines: z.string().nullable(),
      rubricItems: z
        .array(
          z.object({
            id: z.string().optional(),
            order: z.number(),
            points: z.number(),
            description: z.string(),
            explanation: z.string().nullable().optional(),
            graderNote: z.string().nullable().optional(),
            alwaysShowToStudents: z.boolean(),
          }),
        )
        .default([]),
    }),
  )
  .mutation(async (opts) => {
    const { assessment, assessment_question, authn_user } = opts.ctx;

    await manualGrading.updateAssessmentQuestionRubric({
      assessment,
      assessment_question_id: assessment_question.id,
      use_rubric: opts.input.useRubric,
      replace_auto_points: opts.input.replaceAutoPoints,
      starting_points: opts.input.startingPoints,
      min_points: opts.input.minPoints,
      max_extra_points: opts.input.maxExtraPoints,
      rubric_items: opts.input.rubricItems.map((item) => ({
        id: item.id,
        order: item.order,
        points: item.points,
        description: item.description,
        explanation: item.explanation,
        grader_note: item.graderNote,
        always_show_to_students: item.alwaysShowToStudents,
      })),
      tag_for_manual_grading: opts.input.tagForManualGrading,
      grader_guidelines: opts.input.graderGuidelines,
      authn_user_id: authn_user.id,
    });

    const rubricData = await manualGrading.selectRubricData({
      assessment_question,
    });

    const aiGradingEnabled = await run(async () =>
      features.enabled('ai-grading', {
        institution_id: opts.ctx.course.institution_id,
        course_id: opts.ctx.course.id,
        course_instance_id: opts.ctx.course_instance.id,
        user_id: authn_user.id,
      }),
    );

    const aiGradingStats =
      aiGradingEnabled && assessment_question.ai_grading_mode
        ? await calculateAiGradingStats(assessment_question)
        : null;

    return {
      rubricData,
      modifiedAt: new Date().toISOString(),
      aiGradingStats,
    };
  });

export const manualGradingRouter = t.router({
  instances,
  setAiGradingMode: setAiGradingModeMutation,
  deleteAiGradingJobs: deleteAiGradingJobsMutation,
  deleteAiInstanceQuestionGroupings: deleteAiInstanceQuestionGroupingsMutation,
  aiGroupInstanceQuestions: aiGroupInstanceQuestionsMutation,
  aiGradeInstanceQuestions: aiGradeInstanceQuestionsMutation,
  setAssignedGrader: setAssignedGraderMutation,
  setRequiresManualGrading: setRequiresManualGradingMutation,
  modifyRubricSettings: modifyRubricSettingsMutation,
});
