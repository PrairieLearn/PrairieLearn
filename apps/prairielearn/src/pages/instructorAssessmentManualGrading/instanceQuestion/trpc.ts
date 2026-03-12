import { type inferRouterOutputs, TRPCError, initTRPC } from '@trpc/server';
import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import mustache from 'mustache';
import superjson from 'superjson';
import { z } from 'zod';

import { formatDateYMDHM } from '@prairielearn/formatter';
import { markdownToHtml } from '@prairielearn/markdown';
import * as sqldb from '@prairielearn/postgres';
import { run } from '@prairielearn/run';
import { IdSchema } from '@prairielearn/zod';

import { calculateAiGradingStats } from '../../../ee/lib/ai-grading/ai-grading-stats.js';
import {
  containsImageCapture,
  selectLastSubmissionId,
  selectRubricGradingItems,
} from '../../../ee/lib/ai-grading/ai-grading-util.js';
import type {
  InstanceQuestionAIGradingInfo,
  InstanceQuestionAIGradingInfoBase,
} from '../../../ee/lib/ai-grading/types.js';
import {
  selectInstanceQuestionGroup,
  selectInstanceQuestionGroups,
} from '../../../ee/lib/ai-instance-question-grouping/ai-instance-question-grouping-util.js';
import {
  StaffAssessmentQuestionSchema,
  StaffInstanceQuestionGroupSchema,
  StaffUserSchema,
} from '../../../lib/client/safe-db-types.js';
import { AiGradingJobSchema, GradingJobSchema } from '../../../lib/db-types.js';
import { features } from '../../../lib/features/index.js';
import * as manualGrading from '../../../lib/manualGrading.js';
import { formatJsonWithPrettier } from '../../../lib/prettier.js';
import type { ResLocalsForPage } from '../../../lib/res-locals.js';
import { selectCourseInstanceGraderStaff } from '../../../models/course-instances.js';
import { selectUserById } from '../../../models/user.js';

import { GradingJobDataSchema } from './instanceQuestion.html.js';

const sql = sqldb.loadSqlEquiv(
  new URL('./instanceQuestion.sql', import.meta.url).pathname.replace(/\.ts$/, ''),
);

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

const pageDataQuery = t.procedure
  .input(z.object({ conflictGradingJobId: z.string().nullish() }).optional())
  .query(async (opts) => {
    if (!opts.ctx.authz_data.has_course_instance_permission_view) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Access denied (must be a student data viewer)',
      });
    }

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

    // Fetch submission + variant data independently of getAndRenderVariant
    const submissionAndVariant = await sqldb.queryOptionalRow(
      sql.select_submission_and_variant_for_grading,
      { instance_question_id: instance_question.id },
      z.object({
        submission_id: IdSchema,
        submission_feedback: z.record(z.string(), z.any()).nullable(),
        submission_manual_rubric_grading_id: IdSchema.nullable(),
        submission_true_answer: z.record(z.string(), z.any()).nullable(),
        submission_params: z.record(z.string(), z.any()).nullable(),
        submission_submitted_answer: z.record(z.string(), z.any()).nullable(),
        variant_params: z.record(z.string(), z.any()).nullable(),
        variant_true_answer: z.record(z.string(), z.any()).nullable(),
      }),
    );

    if (!submissionAndVariant) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Instance question does not have a gradable submission.',
      });
    }

    // Fetch rubric grading data for the submission
    const rubricGrading = await run(async () => {
      if (!submissionAndVariant.submission_manual_rubric_grading_id) return null;
      const gradingData: Record<string, any> = {
        manual_rubric_grading_id: submissionAndVariant.submission_manual_rubric_grading_id,
      };
      await manualGrading.populateManualGradingData(gradingData);
      if (!gradingData.rubric_grading) return null;
      return {
        adjust_points: gradingData.rubric_grading.adjust_points as number,
        rubric_items: gradingData.rubric_grading.rubric_items as Record<
          string,
          { score: number }
        > | null,
      };
    });

    // Fetch rubric data
    const rubricData = await manualGrading.selectRubricData({
      assessment_question,
      submission: {
        true_answer: submissionAndVariant.submission_true_answer,
        params: submissionAndVariant.submission_params,
        submitted_answer: submissionAndVariant.submission_submitted_answer,
      },
    });

    // Fetch graders
    const graders = await selectCourseInstanceGraderStaff({
      courseInstance: course_instance,
      authzData: authz_data,
      requiredRole: ['Student Data Viewer'],
    });

    // Fetch assigned grader and last grader names
    const assignedGrader = instance_question.assigned_grader
      ? await selectUserById(instance_question.assigned_grader)
      : null;
    const lastGrader = instance_question.last_grader
      ? await selectUserById(instance_question.last_grader)
      : null;
    const lastGraderName = lastGrader?.name ?? lastGrader?.uid ?? 'an unknown grader';

    // Fetch instance question group
    const selectedInstanceQuestionGroup = await run(async () => {
      if (instance_question.manual_instance_question_group_id) {
        return await selectInstanceQuestionGroup(
          instance_question.manual_instance_question_group_id,
        );
      } else if (instance_question.ai_instance_question_group_id) {
        return await selectInstanceQuestionGroup(instance_question.ai_instance_question_group_id);
      }
      return null;
    });

    const instanceQuestionGroups = await selectInstanceQuestionGroups({
      assessmentQuestionId: assessment_question.id,
    });

    // Fetch open issues
    const openIssues = await sqldb.queryRows(
      sql.select_open_issues_for_instance_question,
      { instance_question_id: instance_question.id },
      z.object({ id: IdSchema, open: z.boolean().nullable() }),
    );

    // AI grading
    const aiGradingEnabled = await features.enabled('ai-grading', {
      institution_id: course.institution_id,
      course_id: course.id,
      course_instance_id: course_instance.id,
      user_id: opts.ctx.authn_user.id,
    });
    const aiGradingMode = aiGradingEnabled && assessment_question.ai_grading_mode;

    let aiGradingInfo: InstanceQuestionAIGradingInfo | undefined = undefined;
    if (aiGradingEnabled) {
      const submission_id = await selectLastSubmissionId(instance_question.id);
      const ai_grading_job_data = await sqldb.queryOptionalRow(
        sql.select_ai_grading_job_data_for_submission,
        { submission_id },
        z.object({
          id: GradingJobSchema.shape.id,
          manual_rubric_grading_id: GradingJobSchema.shape.manual_rubric_grading_id,
          prompt: AiGradingJobSchema.shape.prompt,
          completion: AiGradingJobSchema.shape.completion,
          rotation_correction_degrees: AiGradingJobSchema.shape.rotation_correction_degrees,
        }),
      );

      if (ai_grading_job_data) {
        const promptForGradingJob = ai_grading_job_data.prompt;
        const selectedRubricItems = await selectRubricGradingItems(
          ai_grading_job_data.manual_rubric_grading_id,
        );

        const submissionManuallyGraded =
          (await sqldb.queryOptionalScalar(
            sql.select_exists_manual_grading_job_for_submission,
            { submission_id },
            z.boolean(),
          )) ?? false;

        const formattedPrompt =
          promptForGradingJob !== null
            ? (await formatJsonWithPrettier(JSON.stringify(promptForGradingJob, null, 2)))
                .replaceAll('\\n', '\n')
                .trimStart()
            : '';

        const explanation = run(() => {
          const completion = ai_grading_job_data.completion;
          if (!completion) return null;

          if (completion.choices) {
            const explanation = completion?.choices?.[0]?.message?.parsed?.explanation;
            if (typeof explanation !== 'string') return null;
            return explanation.trim() || null;
          }

          if (completion.output_parsed) {
            const explanation = completion?.output_parsed?.explanation;
            if (typeof explanation !== 'string') return null;
            return explanation.trim() || null;
          }

          if (completion.object) {
            const explanation = completion?.object?.explanation;
            if (typeof explanation !== 'string') return null;
            return explanation.trim() || null;
          }

          return null;
        });

        const correctedDegrees = ai_grading_job_data.rotation_correction_degrees;
        const parsed = z.record(z.string(), z.number()).safeParse(correctedDegrees ?? {});
        const validatedDegrees = parsed.success ? parsed.data : {};
        const rotationCorrectionDegrees = Object.fromEntries(
          Object.entries(validatedDegrees).filter(([, degrees]) => degrees !== 0),
        );

        const hasPersistedRotationCorrectionData =
          correctedDegrees != null &&
          typeof correctedDegrees === 'object' &&
          Object.keys(correctedDegrees).length > 0;

        // For the tRPC query, we don't have submissionHtmls available.
        // Use persisted rotation metadata to infer image context.
        const hasImage = hasPersistedRotationCorrectionData;

        const aiGradingInfoBase: InstanceQuestionAIGradingInfoBase = {
          submissionManuallyGraded,
          prompt: formattedPrompt,
          selectedRubricItemIds: selectedRubricItems.map((item) => item.id),
          explanation,
        };

        if (hasImage) {
          aiGradingInfo = {
            ...aiGradingInfoBase,
            hasImage: true,
            rotationCorrectionDegrees,
          };
        } else {
          aiGradingInfo = {
            ...aiGradingInfoBase,
            hasImage: false,
            rotationCorrectionDegrees: null,
          };
        }
      }
    }

    const aiGradingStats =
      aiGradingEnabled && assessment_question.ai_grading_mode
        ? await calculateAiGradingStats(assessment_question)
        : null;

    // Fetch conflict grading job
    const conflictGradingJobId = opts.input?.conflictGradingJobId;
    const conflictGradingJob = await run(async () => {
      if (!conflictGradingJobId) return null;
      const job = await sqldb.queryOptionalRow(
        sql.select_grading_job_data,
        {
          grading_job_id: IdSchema.parse(conflictGradingJobId),
          instance_question_id: instance_question.id,
        },
        GradingJobDataSchema,
      );
      if (job) {
        await manualGrading.populateManualGradingData(job);
      }
      return job;
    });

    // Fetch submission credits
    const submissionCredits = await sqldb.queryScalars(
      sql.select_submission_credit_values,
      { assessment_instance_id: assessment_instance.id },
      z.number(),
    );

    // Render grader guidelines
    const graderGuidelines = rubricData?.rubric.grader_guidelines;
    const mustacheParams = {
      correct_answers: submissionAndVariant.submission_true_answer ?? {},
      params: submissionAndVariant.submission_params ?? {},
      submitted_answers: submissionAndVariant.submission_submitted_answer,
    };
    const graderGuidelinesRendered = graderGuidelines
      ? markdownToHtml(mustache.render(graderGuidelines, mustacheParams), {
          inline: true,
        }).toString()
      : null;

    const instanceQuestionGroupsExist = instanceQuestionGroups.length > 0;

    const auto_points = instance_question.auto_points ?? 0;
    const manual_points = instance_question.manual_points ?? 0;
    const points = instance_question.points ?? 0;

    const effectiveShowSubmissionsAssignedToMeOnly =
      !authz_data.has_course_instance_permission_edit ? false : true;

    return {
      rubricData,
      modifiedAt: instance_question.modified_at.toISOString(),
      aiGradingStats,

      assessmentQuestion: StaffAssessmentQuestionSchema.parse(assessment_question),

      rubricSettingsContext: {
        course_short_name: course.short_name,
        course_instance_short_name: course_instance.short_name,
        assessment_tid: assessment.tid,
        question_qid: question.qid,
        variant_params: submissionAndVariant.variant_params,
        variant_true_answer: submissionAndVariant.variant_true_answer,
        submission_submitted_answer: submissionAndVariant.submission_submitted_answer,
      },

      submissionId: submissionAndVariant.submission_id,
      instanceQuestionId: instance_question.id,
      maxAutoPoints: assessment_question.max_auto_points ?? 0,
      maxManualPoints: assessment_question.max_manual_points ?? 0,
      maxPoints: assessment_question.max_points ?? 0,
      autoPoints: auto_points,
      manualPoints: manual_points,
      totalPoints: points,
      submissionFeedback:
        (submissionAndVariant.submission_feedback as Record<string, any> | null)?.manual ?? null,
      rubricGrading,
      openIssues,
      graders: graders?.map((g) => StaffUserSchema.parse(g)) ?? null,
      aiGradingInfo,
      hasEditPermission: authz_data.has_course_instance_permission_edit,
      showInstanceQuestionGroup: instanceQuestionGroupsExist && aiGradingMode,
      selectedInstanceQuestionGroup: selectedInstanceQuestionGroup
        ? StaffInstanceQuestionGroupSchema.parse(selectedInstanceQuestionGroup)
        : null,
      instanceQuestionGroups: instanceQuestionGroups.map((g) =>
        StaffInstanceQuestionGroupSchema.parse(g),
      ),
      graderGuidelinesRendered,
      conflictGradingJob: conflictGradingJob
        ? {
            grader_name: conflictGradingJob.grader_name,
            auto_points: conflictGradingJob.auto_points,
            manual_points: conflictGradingJob.manual_points,
            score: conflictGradingJob.score,
            feedback: conflictGradingJob.feedback,
          }
        : null,
      conflictGradingJobDateFormatted: conflictGradingJob?.date
        ? formatDateYMDHM(conflictGradingJob.date, course_instance.display_timezone)
        : null,
      conflictLastGraderName: lastGraderName,
      existingDateFormatted: formatDateYMDHM(
        instance_question.modified_at,
        course_instance.display_timezone,
      ),
      displayTimezone: course_instance.display_timezone,
      hasNon100CreditSubmissions: submissionCredits.some((credit) => credit !== 100),
      effectiveShowSubmissionsAssignedToMeOnly,
    };
  });

export const manualGradingInstanceQuestionRouter = t.router({
  pageData: pageDataQuery,
});

export type ManualGradingInstanceQuestionRouter = typeof manualGradingInstanceQuestionRouter;

type RouterOutputs = inferRouterOutputs<ManualGradingInstanceQuestionRouter>;
export type PageData = RouterOutputs['pageData'];
