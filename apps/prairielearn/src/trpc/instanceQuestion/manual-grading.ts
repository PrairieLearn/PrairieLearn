import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';
import { run } from '@prairielearn/run';
import { DateFromISOString, IdSchema } from '@prairielearn/zod';

import { calculateAiGradingStats } from '../../ee/lib/ai-grading/ai-grading-stats.js';
import { toggleAiGradingMode } from '../../ee/lib/ai-grading/ai-grading-util.js';
import { selectAssessmentQuestionHasInstanceQuestionGroups } from '../../ee/lib/ai-instance-question-grouping/ai-instance-question-grouping-util.js';
import { features } from '../../lib/features/index.js';
import { idsEqual } from '../../lib/id.js';
import * as manualGrading from '../../lib/manualGrading.js';
import { selectCourseInstanceGraderStaff } from '../../models/course-instances.js';
import {
  buildGradingContextPayload,
  buildRubricDataPayload,
  fetchSubmissionAndVariant,
} from '../../pages/instructorAssessmentManualGrading/instanceQuestion/queries.js';

import {
  type TRPCContext,
  requireCourseInstancePermissionEdit,
  requireCourseInstancePermissionView,
  t,
} from './init.js';

export interface ManualGradingError {}

const sql = sqldb.loadSqlEquiv(import.meta.url);

async function getAiGradingEnabled(ctx: TRPCContext): Promise<boolean> {
  return features.enabled('ai-grading', {
    institution_id: ctx.course.institution_id,
    course_id: ctx.course.id,
    course_instance_id: ctx.course_instance.id,
    user_id: ctx.authn_user.id,
  });
}

async function getUseInstanceQuestionGroups(ctx: TRPCContext): Promise<boolean> {
  const aiGradingEnabled = await getAiGradingEnabled(ctx);
  if (!aiGradingEnabled || !ctx.assessment_question.ai_grading_mode) {
    return false;
  }
  return selectAssessmentQuestionHasInstanceQuestionGroups({
    assessmentQuestionId: ctx.assessment_question.id,
  });
}

const viewerProcedure = t.procedure.use(requireCourseInstancePermissionView);
const editorProcedure = t.procedure.use(requireCourseInstancePermissionEdit);

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

const addManualGradeMutation = editorProcedure
  .input(
    z.object({
      action: z.enum([
        'add_manual_grade',
        'add_manual_grade_for_instance_question_group_ungraded',
        'add_manual_grade_for_instance_question_group',
      ]),
      submissionId: IdSchema,
      modifiedAt: DateFromISOString,
      usePercentage: z.boolean(),
      scoreManualPoints: z.number().nullish(),
      scoreManualPercent: z.number().nullish(),
      scoreAutoPoints: z.number().nullish(),
      scoreAutoPercent: z.number().nullish(),
      scoreManualAdjustPoints: z.number().nullish(),
      selectedRubricItemIds: z.array(IdSchema).default([]),
      submissionNote: z.string().nullish(),
      issueIdsToClose: z.array(IdSchema).default([]),
      skipGradedSubmissions: z.boolean(),
      showSubmissionsAssignedToMeOnly: z.boolean(),
    }),
  )
  .mutation(async (opts) => {
    const {
      assessment,
      assessment_question,
      instance_question,
      authn_user,
      urlPrefix,
      authz_data,
    } = opts.ctx;
    const input = opts.input;

    opts.ctx.session.skip_graded_submissions = input.skipGradedSubmissions;
    opts.ctx.session.show_submissions_assigned_to_me_only = input.showSubmissionsAssignedToMeOnly;

    const manual_rubric_data = assessment_question.manual_rubric_id
      ? {
          rubric_id: assessment_question.manual_rubric_id,
          applied_rubric_items: input.selectedRubricItemIds.map((id) => ({
            rubric_item_id: id,
          })),
          adjust_points: input.scoreManualAdjustPoints ?? null,
        }
      : undefined;

    const score = {
      manual_score_perc: input.usePercentage ? input.scoreManualPercent : null,
      manual_points: input.usePercentage ? null : input.scoreManualPoints,
      auto_score_perc: input.usePercentage ? input.scoreAutoPercent : null,
      auto_points: input.usePercentage ? null : input.scoreAutoPoints,
      feedback: { manual: input.submissionNote },
      manual_rubric_data,
    };

    if (input.action === 'add_manual_grade') {
      const { modified_at_conflict, grading_job_id } =
        await manualGrading.updateInstanceQuestionScore({
          assessment,
          instance_question_id: instance_question.id,
          submission_id: input.submissionId,
          check_modified_at: input.modifiedAt,
          score,
          authn_user_id: authn_user.id,
        });

      if (modified_at_conflict) {
        return { conflict: true as const, gradingJobId: grading_job_id };
      }

      if (input.issueIdsToClose.length > 0) {
        await sqldb.execute(sql.close_issues_for_instance_question, {
          issue_ids: input.issueIdsToClose,
          instance_question_id: instance_question.id,
          authn_user_id: authn_user.id,
        });
      }

      const useInstanceQuestionGroups = await getUseInstanceQuestionGroups(opts.ctx);

      const nextUrl = await manualGrading.nextInstanceQuestionUrl({
        urlPrefix,
        assessment_id: assessment.id,
        assessment_question_id: assessment_question.id,
        user_id: authz_data.user.id,
        prior_instance_question_id: instance_question.id,
        skip_graded_submissions: input.skipGradedSubmissions,
        show_submissions_assigned_to_me_only: input.showSubmissionsAssignedToMeOnly,
        use_instance_question_groups: useInstanceQuestionGroups,
      });

      return { conflict: false as const, nextUrl };
    }

    // Group grading actions
    const aiGradingEnabled = await getAiGradingEnabled(opts.ctx);
    if (!aiGradingEnabled) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Access denied (feature not available)',
      });
    }

    const useInstanceQuestionGroups = await getUseInstanceQuestionGroups(opts.ctx);
    if (!useInstanceQuestionGroups) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Submission groups not generated.',
      });
    }

    const selectedGroupId =
      instance_question.manual_instance_question_group_id ||
      instance_question.ai_instance_question_group_id;

    if (!selectedGroupId) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Selected instance question group not found',
      });
    }

    const instanceQuestionsInGroup = await sqldb.queryRows(
      sql.select_instance_question_ids_in_group,
      {
        selected_instance_question_group_id: selectedGroupId,
        assessment_id: assessment.id,
        skip_graded_submissions:
          input.action === 'add_manual_grade_for_instance_question_group_ungraded',
      },
      z.object({
        instance_question_id: z.string(),
        submission_id: z.string(),
      }),
    );

    if (instanceQuestionsInGroup.length === 0) {
      const qualifier =
        input.action === 'add_manual_grade_for_instance_question_group_ungraded' ? 'ungraded ' : '';
      return {
        conflict: false as const,
        nextUrl: run(() => {
          const base = `${urlPrefix}/assessment/${assessment.id}/manual_grading`;
          return `${base}/assessment_question/${assessment_question.id}`;
        }),
        flashMessage: {
          type: 'warning' as const,
          message: `No ${qualifier}instance questions in the submission group.`,
        },
      };
    }

    for (const iq of instanceQuestionsInGroup) {
      const { modified_at_conflict } = await manualGrading.updateInstanceQuestionScore({
        assessment,
        instance_question_id: iq.instance_question_id,
        submission_id: iq.submission_id,
        check_modified_at: null,
        score,
        authn_user_id: authn_user.id,
      });

      if (modified_at_conflict) {
        return {
          conflict: false as const,
          nextUrl: run(() => {
            const base = `${urlPrefix}/assessment/${assessment.id}/manual_grading`;
            return `${base}/instance_question/${instance_question.id}`;
          }),
          flashMessage: {
            type: 'error' as const,
            message: 'A conflict occurred while grading the submission. Please try again.',
          },
        };
      }
    }

    const nextUrl = await manualGrading.nextInstanceQuestionUrl({
      urlPrefix,
      assessment_id: assessment.id,
      assessment_question_id: assessment_question.id,
      user_id: authz_data.user.id,
      prior_instance_question_id: instance_question.id,
      skip_graded_submissions: input.skipGradedSubmissions,
      show_submissions_assigned_to_me_only: input.showSubmissionsAssignedToMeOnly,
      use_instance_question_groups: true,
    });

    return {
      conflict: false as const,
      nextUrl,
      flashMessage: {
        type: 'success' as const,
        message: `Successfully applied grade and feedback to ${instanceQuestionsInGroup.length} instance questions.`,
      },
    };
  });

const nextInstanceQuestionMutation = viewerProcedure
  .input(
    z.object({
      skipGradedSubmissions: z.boolean(),
      showSubmissionsAssignedToMeOnly: z.boolean(),
    }),
  )
  .mutation(async (opts) => {
    const { assessment, assessment_question, instance_question, authz_data } = opts.ctx;

    opts.ctx.session.skip_graded_submissions = opts.input.skipGradedSubmissions;
    opts.ctx.session.show_submissions_assigned_to_me_only =
      opts.input.showSubmissionsAssignedToMeOnly;

    const useInstanceQuestionGroups = await getUseInstanceQuestionGroups(opts.ctx);

    return manualGrading.nextInstanceQuestionUrl({
      urlPrefix: opts.ctx.urlPrefix,
      assessment_id: assessment.id,
      assessment_question_id: assessment_question.id,
      user_id: authz_data.user.id,
      prior_instance_question_id: instance_question.id,
      skip_graded_submissions: opts.input.skipGradedSubmissions,
      show_submissions_assigned_to_me_only: opts.input.showSubmissionsAssignedToMeOnly,
      use_instance_question_groups: useInstanceQuestionGroups,
    });
  });

const reassignGraderMutation = editorProcedure
  .input(
    z.object({
      action: z.string(),
      skipGradedSubmissions: z.boolean(),
      showSubmissionsAssignedToMeOnly: z.boolean(),
    }),
  )
  .mutation(async (opts) => {
    const { assessment, assessment_question, instance_question, authz_data, course_instance } =
      opts.ctx;
    const { action } = opts.input;

    const assigned_grader = ['nobody', 'graded'].includes(action) ? null : action;
    if (assigned_grader != null) {
      const courseStaff = await selectCourseInstanceGraderStaff({
        courseInstance: course_instance,
        authzData: authz_data,
        requiredRole: ['Student Data Editor'],
      });
      if (!courseStaff.some((staff) => idsEqual(staff.id, assigned_grader))) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Assigned grader does not have Student Data Editor permission',
        });
      }
    }

    await sqldb.execute(sql.update_assigned_grader, {
      instance_question_id: instance_question.id,
      assigned_grader,
      requires_manual_grading: action !== 'graded',
    });

    opts.ctx.session.skip_graded_submissions = opts.input.skipGradedSubmissions;
    opts.ctx.session.show_submissions_assigned_to_me_only =
      opts.input.showSubmissionsAssignedToMeOnly;

    const useInstanceQuestionGroups = await getUseInstanceQuestionGroups(opts.ctx);

    return manualGrading.nextInstanceQuestionUrl({
      urlPrefix: opts.ctx.urlPrefix,
      assessment_id: assessment.id,
      assessment_question_id: assessment_question.id,
      user_id: authz_data.user.id,
      prior_instance_question_id: instance_question.id,
      skip_graded_submissions: opts.input.skipGradedSubmissions,
      show_submissions_assigned_to_me_only: opts.input.showSubmissionsAssignedToMeOnly,
      use_instance_question_groups: useInstanceQuestionGroups,
    });
  });

// TODO: This mutation duplicates the one in assessmentQuestion/trpc.ts.
// Extract the shared logic into a helper so both routers call the same implementation.
const modifyRubricSettingsMutation = editorProcedure
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
    const { assessment, assessment_question, instance_question, authn_user } = opts.ctx;

    await manualGrading.updateAssessmentQuestionRubric({
      assessment,
      assessment_question_id: instance_question.assessment_question_id,
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

    const aiGradingEnabled = await getAiGradingEnabled(opts.ctx);
    const aiGradingStats =
      aiGradingEnabled && assessment_question.ai_grading_mode
        ? await calculateAiGradingStats(assessment_question)
        : null;

    return {
      rubricData,
      modifiedAt: instance_question.modified_at.toISOString(),
      aiGradingStats,
    };
  });

const toggleAiGradingModeMutation = editorProcedure.mutation(async (opts) => {
  await toggleAiGradingMode(opts.ctx.assessment_question.id);
});

export const manualGradingRouter = t.router({
  rubricData: rubricDataQuery,
  gradingContext: gradingContextQuery,
  addManualGrade: addManualGradeMutation,
  nextInstanceQuestion: nextInstanceQuestionMutation,
  reassignGrader: reassignGraderMutation,
  modifyRubricSettings: modifyRubricSettingsMutation,
  toggleAiGradingMode: toggleAiGradingModeMutation,
});
