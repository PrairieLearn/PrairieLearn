import mustache from 'mustache';
import { z } from 'zod';

import { formatDateYMDHM } from '@prairielearn/formatter';
import { markdownToHtml } from '@prairielearn/markdown';
import * as sqldb from '@prairielearn/postgres';
import { run } from '@prairielearn/run';
import { IdSchema } from '@prairielearn/zod';

import { calculateAiGradingStats } from '../../../ee/lib/ai-grading/ai-grading-stats.js';
import {
  selectLastSubmissionId,
  selectRubricGradingItems,
} from '../../../ee/lib/ai-grading/ai-grading-util.js';
import type {
  AiGradingGeneralStats,
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
import {
  AiGradingJobSchema,
  type Assessment,
  type AssessmentInstance,
  type AssessmentQuestion,
  type Course,
  type CourseInstance,
  GradingJobSchema,
  type InstanceQuestion,
  type Question,
} from '../../../lib/db-types.js';
import * as manualGrading from '../../../lib/manualGrading.js';
import { formatJsonWithPrettier } from '../../../lib/prettier.js';
import type { ResLocalsCourseInstanceAuthz } from '../../../middlewares/authzCourseOrInstance.js';
import { selectCourseInstanceGraderStaff } from '../../../models/course-instances.js';
import { selectUserById } from '../../../models/user.js';

export const sql = sqldb.loadSqlEquiv(import.meta.url);

export const GradingJobDataSchema = GradingJobSchema.extend({
  score_perc: z.number().nullable(),
  grader_name: z.string().nullable(),
});
export type GradingJobData = z.infer<typeof GradingJobDataSchema>;

const SubmissionAndVariantSchema = z.object({
  submission_id: IdSchema,
  submission_feedback: z.record(z.string(), z.any()).nullable(),
  submission_manual_rubric_grading_id: IdSchema.nullable(),
  submission_true_answer: z.record(z.string(), z.any()).nullable(),
  submission_params: z.record(z.string(), z.any()).nullable(),
  submission_submitted_answer: z.record(z.string(), z.any()).nullable(),
  variant_params: z.record(z.string(), z.any()).nullable(),
  variant_true_answer: z.record(z.string(), z.any()).nullable(),
});

export type SubmissionAndVariant = z.infer<typeof SubmissionAndVariantSchema>;

export async function fetchSubmissionAndVariant(
  instanceQuestionId: string,
): Promise<SubmissionAndVariant | null> {
  return sqldb.queryOptionalRow(
    sql.select_submission_and_variant_for_grading,
    { instance_question_id: instanceQuestionId },
    SubmissionAndVariantSchema,
  );
}

/**
 * Builds the AI grading info for an instance question. This logic was previously
 * duplicated between the SSR route handler and the tRPC query.
 *
 * The `hasImageFallback` parameter allows the SSR path to pass a fallback function
 * that checks rendered HTML for image capture markers (the tRPC path doesn't have
 * rendered HTML available, so it checks `submitted_answer._files` instead).
 */
export async function buildAiGradingInfo({
  instanceQuestionId,
  submissionSubmittedAnswer,
  hasImageFallback,
}: {
  instanceQuestionId: string;
  submissionSubmittedAnswer: Record<string, any> | null;
  hasImageFallback?: () => boolean;
}): Promise<InstanceQuestionAIGradingInfo | undefined> {
  const submission_id = await selectLastSubmissionId(instanceQuestionId);
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

  if (!ai_grading_job_data) return undefined;

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

  // We're dealing with a schemaless JSON blob here. We'll be defensive and
  // try to avoid errors when extracting the explanation. Note that for some
  // time, the explanation wasn't included in the completion at all, so it
  // may legitimately be missing.
  //
  // Over the lifetime of this feature, we've changed which APIs/libraries we
  // use to generate the completion, so we need to handle all formats we've ever
  // used for backwards-compatibility. Each one is documented below.
  const explanation = run(() => {
    const completion = ai_grading_job_data.completion;
    if (!completion) return null;

    // OpenAI chat completion format
    if (completion.choices) {
      const explanation = completion?.choices?.[0]?.message?.parsed?.explanation;
      if (typeof explanation !== 'string') return null;
      return explanation.trim() || null;
    }

    // OpenAI response format
    if (completion.output_parsed) {
      const explanation = completion?.output_parsed?.explanation;
      if (typeof explanation !== 'string') return null;
      return explanation.trim() || null;
    }

    // `ai` package format
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

  const hasImage = run(() => {
    if (hasPersistedRotationCorrectionData) return true;
    // Use the caller-provided fallback if available (SSR path checks rendered HTML),
    // otherwise check submitted_answer for image capture files (tRPC path).
    if (hasImageFallback) return hasImageFallback();
    const files = submissionSubmittedAnswer?._files;
    if (Array.isArray(files)) {
      return files.some(
        (f: { name?: string }) => typeof f.name === 'string' && /\.(jpe?g)$/i.test(f.name),
      );
    }
    return false;
  });

  const aiGradingInfoBase: InstanceQuestionAIGradingInfoBase = {
    submissionManuallyGraded,
    prompt: formattedPrompt,
    selectedRubricItemIds: selectedRubricItems.map((item) => item.id),
    explanation,
  };

  if (hasImage) {
    return {
      ...aiGradingInfoBase,
      hasImage: true,
      rotationCorrectionDegrees,
    };
  } else {
    return {
      ...aiGradingInfoBase,
      hasImage: false,
      rotationCorrectionDegrees: null,
    };
  }
}

export async function buildRubricDataPayload({
  assessmentQuestion,
  instanceQuestion,
  submissionAndVariant,
  aiGradingEnabled,
}: {
  assessmentQuestion: AssessmentQuestion;
  instanceQuestion: Pick<InstanceQuestion, 'modified_at'>;
  submissionAndVariant: SubmissionAndVariant;
  aiGradingEnabled: boolean;
}) {
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

  const rubricData = await manualGrading.selectRubricData({
    assessment_question: assessmentQuestion,
    submission: {
      true_answer: submissionAndVariant.submission_true_answer,
      params: submissionAndVariant.submission_params,
      submitted_answer: submissionAndVariant.submission_submitted_answer,
    },
  });

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

  const aiGradingStats: AiGradingGeneralStats | null =
    aiGradingEnabled && assessmentQuestion.ai_grading_mode
      ? await calculateAiGradingStats(assessmentQuestion)
      : null;

  return {
    rubricData,
    rubricGrading,
    graderGuidelinesRendered,
    assessmentQuestion: StaffAssessmentQuestionSchema.parse(assessmentQuestion),
    aiGradingStats,
    modifiedAt: instanceQuestion.modified_at.toISOString(),
  };
}

export async function buildGradingContextPayload({
  course,
  courseInstance,
  assessment,
  assessmentInstance,
  question,
  assessmentQuestion,
  instanceQuestion,
  authzData,
  submissionAndVariant,
  aiGradingEnabled,
  conflictGradingJobId,
}: {
  course: Course;
  courseInstance: CourseInstance;
  assessment: Assessment;
  assessmentInstance: AssessmentInstance;
  question: Question;
  assessmentQuestion: AssessmentQuestion;
  instanceQuestion: InstanceQuestion;
  authzData: ResLocalsCourseInstanceAuthz;
  submissionAndVariant: SubmissionAndVariant;
  aiGradingEnabled: boolean;
  conflictGradingJobId?: string | null;
}) {
  const aiGradingMode = aiGradingEnabled && assessmentQuestion.ai_grading_mode;

  // Fetch graders
  const graders = await selectCourseInstanceGraderStaff({
    courseInstance,
    authzData,
    requiredRole: ['Student Data Viewer'],
  });

  // Fetch last grader name
  const lastGrader = instanceQuestion.last_grader
    ? await selectUserById(instanceQuestion.last_grader)
    : null;
  const lastGraderName = lastGrader?.name ?? lastGrader?.uid ?? 'an unknown grader';

  // Fetch instance question groups
  const selectedInstanceQuestionGroup = await run(async () => {
    if (instanceQuestion.manual_instance_question_group_id) {
      return await selectInstanceQuestionGroup(instanceQuestion.manual_instance_question_group_id);
    } else if (instanceQuestion.ai_instance_question_group_id) {
      return await selectInstanceQuestionGroup(instanceQuestion.ai_instance_question_group_id);
    }
    return null;
  });

  const instanceQuestionGroups = await selectInstanceQuestionGroups({
    assessmentQuestionId: assessmentQuestion.id,
  });

  // Fetch open issues
  const openIssues = await sqldb.queryRows(
    sql.select_open_issues_for_instance_question,
    { instance_question_id: instanceQuestion.id },
    z.object({ id: IdSchema, open: z.boolean().nullable() }),
  );

  // AI grading info
  let aiGradingInfo: InstanceQuestionAIGradingInfo | undefined = undefined;
  if (aiGradingEnabled) {
    aiGradingInfo = await buildAiGradingInfo({
      instanceQuestionId: instanceQuestion.id,
      submissionSubmittedAnswer: submissionAndVariant.submission_submitted_answer,
    });
  }

  // Fetch conflict grading job
  const conflictGradingJob = conflictGradingJobId
    ? await sqldb.queryOptionalRow(
        sql.select_grading_job_data,
        {
          grading_job_id: IdSchema.parse(conflictGradingJobId),
          instance_question_id: instanceQuestion.id,
        },
        GradingJobDataSchema,
      )
    : null;

  // Extract rubric grading from the conflict grading job, if present.
  const conflictRubricGrading = await run(async () => {
    if (!conflictGradingJob?.manual_rubric_grading_id) return null;
    const gradingData: Record<string, any> = {
      manual_rubric_grading_id: conflictGradingJob.manual_rubric_grading_id,
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

  // Fetch submission credits
  const submissionCredits = await sqldb.queryScalars(
    sql.select_submission_credit_values,
    { assessment_instance_id: assessmentInstance.id },
    z.number(),
  );

  const instanceQuestionGroupsExist = instanceQuestionGroups.length > 0;
  const auto_points = instanceQuestion.auto_points ?? 0;
  const manual_points = instanceQuestion.manual_points ?? 0;
  const points = instanceQuestion.points ?? 0;

  return {
    rubricSettingsContext: {
      course_short_name: course.short_name,
      course_instance_short_name: courseInstance.short_name,
      assessment_tid: assessment.tid,
      question_qid: question.qid,
      variant_params: submissionAndVariant.variant_params,
      variant_true_answer: submissionAndVariant.variant_true_answer,
      submission_submitted_answer: submissionAndVariant.submission_submitted_answer,
    },
    submissionId: submissionAndVariant.submission_id,
    instanceQuestionId: instanceQuestion.id,
    maxAutoPoints: assessmentQuestion.max_auto_points ?? 0,
    maxManualPoints: assessmentQuestion.max_manual_points ?? 0,
    maxPoints: assessmentQuestion.max_points ?? 0,
    autoPoints: auto_points,
    manualPoints: manual_points,
    totalPoints: points,
    submissionFeedback: submissionAndVariant.submission_feedback?.manual ?? null,
    openIssues,
    graders: graders.map((g) => StaffUserSchema.parse(g)),
    aiGradingInfo,
    hasEditPermission: authzData.has_course_instance_permission_edit,
    showInstanceQuestionGroup: instanceQuestionGroupsExist && aiGradingMode,
    selectedInstanceQuestionGroup: selectedInstanceQuestionGroup
      ? StaffInstanceQuestionGroupSchema.parse(selectedInstanceQuestionGroup)
      : null,
    instanceQuestionGroups: instanceQuestionGroups.map((g) =>
      StaffInstanceQuestionGroupSchema.parse(g),
    ),
    conflictGradingJob: conflictGradingJob
      ? {
          grader_name: conflictGradingJob.grader_name,
          auto_points: conflictGradingJob.auto_points,
          manual_points: conflictGradingJob.manual_points,
          score: conflictGradingJob.score,
          feedback: conflictGradingJob.feedback,
          rubric_grading: conflictRubricGrading,
        }
      : null,
    conflictGradingJobDateFormatted: conflictGradingJob?.date
      ? formatDateYMDHM(conflictGradingJob.date, courseInstance.display_timezone)
      : null,
    conflictLastGraderName: lastGraderName,
    existingDateFormatted: formatDateYMDHM(
      instanceQuestion.modified_at,
      courseInstance.display_timezone,
    ),
    displayTimezone: courseInstance.display_timezone,
    hasNon100CreditSubmissions: submissionCredits.some((credit) => credit !== 100),
    effectiveShowSubmissionsAssignedToMeOnly: authzData.has_course_instance_permission_edit,
  };
}
