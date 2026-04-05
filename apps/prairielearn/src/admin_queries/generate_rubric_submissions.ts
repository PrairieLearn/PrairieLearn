import { z } from 'zod';

import { loadSqlEquiv, queryOptionalRow, queryRows } from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { closeAssessmentInstance } from '../lib/assessment.js';
import { config } from '../lib/config.js';
import {
  AssessmentQuestionSchema,
  type Course,
  type CourseInstance,
  CourseSchema,
  type InstanceQuestion,
  InstanceQuestionSchema,
  QuestionSchema,
  type User,
  UserSchema,
} from '../lib/db-types.js';
import { saveSubmission } from '../lib/grading.js';
import {
  updateAssessmentQuestionRubric,
  updateInstanceQuestionScore,
} from '../lib/manualGrading.js';
import type { RubricItemInput } from '../lib/manualGrading.types.js';
import { createTestSubmissionData } from '../lib/question-testing.js';
import { ensureVariant } from '../lib/question-variant.js';
import { unsetGradingNeeded } from '../models/assessment-instance.js';
import { selectOptionalAssessmentById } from '../models/assessment.js';
import { selectOptionalCourseInstanceById } from '../models/course-instances.js';
import { selectCourseById } from '../models/course.js';
import { selectCompleteRubric } from '../models/rubrics.js';

import { type AdministratorQueryResult, type AdministratorQuerySpecs } from './lib/util.js';

export const specs: AdministratorQuerySpecs = {
  description:
    'Creates a rubric on a manually-graded question and generates ungraded submissions for testing the manual grading UI.',
  enabled: config.devMode,
  params: [
    {
      name: 'assessment_id',
      description: 'assessment_id to generate rubric submissions for (integer)',
    },
    {
      name: 'question_qid',
      description:
        'QID of the question to attach the rubric to (e.g., "demo/manualGrade"). If blank, uses the first manually-graded question.',
      default: '',
    },
    {
      name: 'rubric_json',
      description:
        'JSON rubric definition. If blank, generates a fake rubric using the params below.',
      default: '',
    },
    {
      name: 'num_items',
      description: 'Number of rubric items to generate when rubric_json is blank (integer)',
      default: '5',
    },
    {
      name: 'include_negative_item',
      description:
        'Whether to include a negative-point rubric item in the generated rubric ("true" or "false")',
      default: 'true',
    },
    {
      name: 'replace_auto_points',
      description:
        'If true, rubric points replace the total grade. If false, rubric points are added to auto-graded points ("true" or "false")',
      default: 'false',
    },
    {
      name: 'percent_graded',
      description:
        'Percentage of submissions to randomly grade with the rubric (0-100). Each graded submission gets a random selection of rubric items applied.',
      default: '50',
    },
  ],
};

const sql = loadSqlEquiv(import.meta.url);

const columns = [
  'assessment_question_id',
  'qid',
  'rubric_id',
  'rubric_items',
  'submissions_created',
  'submissions_graded',
] as const;

const AssessmentQuestionQuerySchema = z.object({
  assessment_question: AssessmentQuestionSchema,
  question: QuestionSchema,
  question_course: CourseSchema,
});

const InstanceQuestionQuerySchema = z.object({
  instance_question: InstanceQuestionSchema,
  user: UserSchema,
});

interface RubricConfig {
  starting_points: number;
  min_points: number;
  max_extra_points: number;
  replace_auto_points: boolean;
  grader_guidelines: string | null;
  rubric_items: RubricItemInput[];
}

const RubricJsonSchema = z.object({
  starting_points: z.number().default(0),
  min_points: z.number().default(0),
  max_extra_points: z.number().default(0),
  replace_auto_points: z.boolean().default(false),
  grader_guidelines: z.string().nullable().default(null),
  rubric_items: z
    .array(
      z.object({
        description: z.string(),
        points: z.number(),
        explanation: z.string().nullable().optional(),
        grader_note: z.string().nullable().optional(),
        always_show_to_students: z.boolean().optional(),
      }),
    )
    .min(1),
});

export default async function (
  {
    assessment_id,
    question_qid,
    rubric_json,
    num_items: num_items_str,
    include_negative_item: include_negative_str,
    replace_auto_points: replace_auto_points_str,
    percent_graded: percent_graded_str,
  }: {
    assessment_id: string;
    question_qid: string;
    rubric_json: string;
    num_items: string;
    include_negative_item: string;
    replace_auto_points: string;
    percent_graded: string;
  },
  { authn_user_id }: { authn_user_id: string },
): Promise<AdministratorQueryResult> {
  const percentGraded = Math.max(0, Math.min(100, Number.parseInt(percent_graded_str, 10) || 50));
  const assessment = await selectOptionalAssessmentById(assessment_id);
  if (!assessment) return { rows: [{ error: 'Assessment not found' }], columns: ['error'] };

  const courseInstance = await selectOptionalCourseInstanceById(assessment.course_instance_id);
  if (!courseInstance) {
    return { rows: [{ error: 'Course instance not found' }], columns: ['error'] };
  }

  const assessmentCourse = await selectCourseById(courseInstance.course_id);

  // Find all assessment questions for this assessment.
  const assessmentQuestions = await queryRows(
    sql.select_assessment_questions,
    { assessment_id },
    AssessmentQuestionQuerySchema,
  );

  // Find the target question.
  const target = findTargetQuestion(assessmentQuestions, question_qid);
  if (!target) {
    return {
      rows: [
        {
          error: question_qid
            ? `No manually-graded question found with QID "${question_qid}" on this assessment`
            : 'No manually-graded question found on this assessment',
        },
      ],
      columns: ['error'],
    };
  }

  // Parse or generate rubric config.
  const rubricConfig = rubric_json.trim()
    ? parseRubricJson(rubric_json)
    : generateFakeRubric({
        numItems: Number.parseInt(num_items_str, 10) || 5,
        includeNegativeItem: include_negative_str !== 'false',
        replaceAutoPoints: replace_auto_points_str === 'true',
        maxPoints: target.assessment_question.max_manual_points ?? 10,
      });

  // Create/replace the rubric on the target question.
  // Use a fake authn_user_id from the first instance question's user, or fall back to '1'.
  const instanceQuestions = await queryRows(
    sql.select_instance_questions_for_assessment_question,
    { assessment_question_id: target.assessment_question.id },
    InstanceQuestionQuerySchema,
  );

  await updateAssessmentQuestionRubric({
    assessment,
    assessment_question_id: target.assessment_question.id,
    use_rubric: true,
    replace_auto_points: rubricConfig.replace_auto_points,
    starting_points: rubricConfig.starting_points,
    min_points: rubricConfig.min_points,
    max_extra_points: rubricConfig.max_extra_points,
    rubric_items: rubricConfig.rubric_items,
    tag_for_manual_grading: true,
    grader_guidelines: rubricConfig.grader_guidelines,
    authn_user_id,
  });

  // Re-fetch the assessment question to get the new rubric_id.
  const updatedAqs = await queryRows(
    sql.select_assessment_questions,
    { assessment_id },
    AssessmentQuestionQuerySchema,
  );
  const updatedTarget = updatedAqs.find((aq) => aq.question.qid === target.question.qid);
  const rubricId = updatedTarget?.assessment_question.manual_rubric_id ?? 'unknown';

  // Generate one submission per instance question that doesn't already have one,
  // then close the assessment instance.
  let submissionsCreated = 0;
  const closedInstanceIds = new Set<string>();
  for (const iq of instanceQuestions) {
    const existing = await queryOptionalRow(
      sql.select_existing_submission,
      { instance_question_id: iq.instance_question.id },
      z.object({ id: IdSchema }),
    );
    if (!existing) {
      await createSubmission({
        instanceQuestion: iq.instance_question,
        user: iq.user,
        question: target.question,
        questionCourse: target.question_course,
        courseInstance,
        assessmentCourse,
      });
      submissionsCreated++;
    }

    const aiId = iq.instance_question.assessment_instance_id;
    if (!closedInstanceIds.has(aiId)) {
      // Close the instance, then immediately clear grading_needed so that
      // autoFinishExams doesn't pick up these synthetic submissions.
      await closeAssessmentInstance({
        assessment_instance_id: aiId,
        authn_user_id,
        client_fingerprint_id: null,
      });
      await unsetGradingNeeded(aiId);
      closedInstanceIds.add(aiId);
    }
  }

  // Randomly grade a percentage of submissions using the rubric.
  let submissionsGraded = 0;
  if (percentGraded > 0) {
    const { rubric_items: dbRubricItems } = await selectCompleteRubric(
      target.assessment_question.id,
    );

    for (const iq of instanceQuestions) {
      if (Math.random() * 100 >= percentGraded) continue;

      const submission = await queryOptionalRow(
        sql.select_existing_submission,
        { instance_question_id: iq.instance_question.id },
        z.object({ id: IdSchema }),
      );
      if (!submission) continue;

      // Randomly select which rubric items to apply.
      const appliedRubricItems = dbRubricItems
        .filter(() => Math.random() < 0.5)
        .map((item) => ({ rubric_item_id: item.id }));

      await updateInstanceQuestionScore({
        assessment,
        instance_question_id: iq.instance_question.id,
        submission_id: submission.id,
        check_modified_at: null,
        score: {
          manual_rubric_data: {
            rubric_id: rubricId,
            applied_rubric_items: appliedRubricItems,
            adjust_points: 0,
          },
        },
        authn_user_id,
      });
      submissionsGraded++;
    }
  }

  return {
    rows: [
      {
        assessment_question_id: target.assessment_question.id,
        qid: target.question.qid ?? target.question.id,
        rubric_id: rubricId,
        rubric_items: rubricConfig.rubric_items.length,
        submissions_created: submissionsCreated,
        submissions_graded: submissionsGraded,
      },
    ],
    columns,
  };
}

function findTargetQuestion(
  assessmentQuestions: z.infer<typeof AssessmentQuestionQuerySchema>[],
  questionQid: string,
): z.infer<typeof AssessmentQuestionQuerySchema> | undefined {
  if (questionQid.trim()) {
    return assessmentQuestions.find(
      (aq) =>
        aq.question.qid === questionQid.trim() &&
        (aq.assessment_question.max_manual_points ?? 0) > 0,
    );
  }
  // Auto-pick the first manually-graded question.
  return assessmentQuestions.find((aq) => (aq.assessment_question.max_manual_points ?? 0) > 0);
}

function parseRubricJson(json: string): RubricConfig {
  const parsed = RubricJsonSchema.parse(JSON.parse(json));
  return {
    starting_points: parsed.starting_points,
    min_points: parsed.min_points,
    max_extra_points: parsed.max_extra_points,
    replace_auto_points: parsed.replace_auto_points,
    grader_guidelines: parsed.grader_guidelines,
    rubric_items: parsed.rubric_items.map((item, i) => ({
      order: i,
      description: item.description,
      points: item.points,
      explanation: item.explanation ?? null,
      grader_note: item.grader_note ?? null,
      always_show_to_students: item.always_show_to_students ?? true,
    })),
  };
}

function generateFakeRubric({
  numItems,
  includeNegativeItem,
  replaceAutoPoints,
  maxPoints,
}: {
  numItems: number;
  includeNegativeItem: boolean;
  replaceAutoPoints: boolean;
  maxPoints: number;
}): RubricConfig {
  const items: RubricItemInput[] = [];
  const positiveCount = includeNegativeItem ? numItems - 1 : numItems;
  if (positiveCount < 1) {
    throw new Error(
      `num_items must be at least ${includeNegativeItem ? 2 : 1} when include_negative_item is ${includeNegativeItem}`,
    );
  }

  // Generate random weights then scale so positive items sum exactly to maxPoints.
  const rawWeights = Array.from({ length: positiveCount }, () => 0.5 + Math.random());
  const weightSum = rawWeights.reduce((a, b) => a + b, 0);
  const rawPoints = rawWeights.map((w) => (w / weightSum) * maxPoints);

  // Round to one decimal place, then adjust the last item to absorb rounding error.
  const roundedPoints = rawPoints.map((p) => Math.round(p * 10) / 10);
  const roundingError = maxPoints - roundedPoints.reduce((a, b) => a + b, 0);
  roundedPoints[roundedPoints.length - 1] =
    Math.round((roundedPoints[roundedPoints.length - 1] + roundingError) * 10) / 10;

  for (let i = 0; i < positiveCount; i++) {
    items.push({
      order: i,
      description: `Criterion ${i + 1}`,
      points: roundedPoints[i],
      explanation: `Award points if the student demonstrates criterion ${i + 1}.`,
      grader_note: `Look for evidence of criterion ${i + 1} in the student's response.`,
      always_show_to_students: true,
    });
  }

  if (includeNegativeItem) {
    const avgPoints = maxPoints / positiveCount;
    const penalty = -Math.round(avgPoints * 0.5 * 10) / 10;
    items.push({
      order: positiveCount,
      description: 'Style/formatting penalty',
      points: penalty,
      explanation: 'Deduct points for poor style or formatting.',
      grader_note:
        'Check for inconsistent formatting, unclear variable names, or missing comments.',
      always_show_to_students: true,
    });
  }

  return {
    starting_points: 0,
    min_points: 0,
    max_extra_points: 0,
    replace_auto_points: replaceAutoPoints,
    grader_guidelines: 'This is a generated test rubric for development testing.',
    rubric_items: items,
  };
}

async function createSubmission({
  instanceQuestion,
  user,
  question,
  questionCourse,
  courseInstance,
  assessmentCourse,
}: {
  instanceQuestion: InstanceQuestion;
  user: User;
  question: z.infer<typeof QuestionSchema>;
  questionCourse: Course;
  courseInstance: CourseInstance;
  assessmentCourse: Course;
}): Promise<void> {
  const variant = await ensureVariant({
    question_id: question.id,
    instance_question_id: instanceQuestion.id,
    user_id: user.id,
    authn_user_id: user.id,
    course_instance: courseInstance,
    variant_course: assessmentCourse,
    question_course: questionCourse,
    options: { variant_seed: null },
    require_open: true,
    client_fingerprint_id: null,
  });

  const { data } = await createTestSubmissionData(
    variant,
    question,
    assessmentCourse,
    'correct',
    user.id,
    user.id,
  );

  await saveSubmission(
    {
      ...data,
      auth_user_id: user.id,
      user_id: user.id,
      variant_id: variant.id,
      submitted_answer: data.raw_submitted_answer,
      credit: 100,
    },
    variant,
    question,
    assessmentCourse,
  );
}
