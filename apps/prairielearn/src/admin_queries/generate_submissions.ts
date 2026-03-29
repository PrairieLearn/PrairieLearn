import { mapLimit } from 'async';
import { groupBy } from 'es-toolkit';
import { z } from 'zod';

import { execute, loadSqlEquiv, queryOptionalRow, queryRow, queryRows } from '@prairielearn/postgres';

import { closeAssessmentInstance } from '../lib/assessment.js';
import { config } from '../lib/config.js';
import {
  type Assessment,
  AssessmentQuestionSchema,
  type Course,
  type CourseInstance,
  CourseSchema,
  type InstanceQuestion,
  InstanceQuestionSchema,
  type Question,
  QuestionSchema,
  type User,
  UserSchema,
} from '../lib/db-types.js';
import { saveAndGradeSubmission, saveSubmission } from '../lib/grading.js';
import { updateInstanceQuestionScore } from '../lib/manualGrading.js';
import { TEST_TYPES, type TestType, createTestSubmissionData } from '../lib/question-testing.js';
import { ensureVariant } from '../lib/question-variant.js';
import { selectOptionalAssessmentById } from '../models/assessment.js';
import { selectOptionalCourseInstanceById } from '../models/course-instances.js';
import { selectCourseById } from '../models/course.js';

import { type AdministratorQueryResult, type AdministratorQuerySpecs } from './lib/util.js';

export const specs: AdministratorQuerySpecs = {
  description:
    'Generates submissions, grades, and optionally closes assessment instances for an assessment. Handles auto-graded, externally-graded, and manually-graded questions.',
  enabled: config.devMode,
  params: [
    {
      name: 'assessment_id',
      description: 'assessment_id to generate submissions for (integer)',
    },
    {
      name: 'test_type',
      description: `Type of submission to generate (${TEST_TYPES.map((type) => `"${type}"`).join(', ')} or "random")`,
      default: 'random',
    },
    {
      name: 'max_attempts',
      description: 'Maximum number of submission attempts per question (integer)',
      default: '10',
    },
    {
      name: 'close',
      description:
        'Whether to close assessment instances after completing all questions ("true" or "false")',
      default: 'true',
    },
  ],
};

const sql = loadSqlEquiv(import.meta.url);

const columns = [
  'course_instance_id',
  'course_instance',
  'assessment_id',
  'assessment',
  'assessment_instance_id',
  'uid',
  'qid',
  'test_type',
  'attempts',
  'auto_points',
  'manual_points',
  'max_auto_points',
  'max_manual_points',
  'status',
  'closed',
] as const;
type ResultRow = Record<(typeof columns)[number], string | number | null>;

const InstanceQuestionQuerySchema = z.object({
  instance_question: InstanceQuestionSchema,
  question: QuestionSchema,
  user: UserSchema,
  question_course: CourseSchema,
  assessment_question: AssessmentQuestionSchema,
});
type InstanceQuestionQuery = z.infer<typeof InstanceQuestionQuerySchema>;

const InstanceQuestionRefetchSchema = z.object({
  instance_question: InstanceQuestionSchema,
});

interface SharedContext {
  assessment: Assessment;
  courseInstance: CourseInstance;
  assessmentCourse: Course;
  testType: TestType | 'random';
  maxAttempts: number;
}

interface QuestionResult {
  attempts: number;
  lastSubmissionId: string | null;
  testType: TestType;
}

interface FinalizedInstanceQuestion {
  instanceQuestion: InstanceQuestionQuery;
  attempts: number;
  testType: TestType;
  finalInstanceQuestion: InstanceQuestion;
}

const CONCURRENCY = 5;

export default async function ({
  assessment_id,
  test_type,
  max_attempts: max_attempts_str,
  close: close_str,
}: {
  assessment_id: string;
  test_type: TestType | 'random';
  max_attempts: string;
  close: string;
}): Promise<AdministratorQueryResult> {
  const assessment = await selectOptionalAssessmentById(assessment_id);
  if (!assessment) return { rows: [], columns };
  const courseInstance = await selectOptionalCourseInstanceById(assessment.course_instance_id);
  if (!courseInstance) return { rows: [], columns };
  const assessmentCourse = await selectCourseById(courseInstance.course_id);

  const parsed = Number.parseInt(max_attempts_str, 10);
  const ctx: SharedContext = {
    assessment,
    courseInstance,
    assessmentCourse,
    testType: test_type,
    maxAttempts: Number.isNaN(parsed) ? 10 : parsed,
  };
  const shouldClose = close_str === 'true';

  const instanceQuestions = await queryRows(
    sql.select_instance_questions,
    { assessment_id },
    InstanceQuestionQuerySchema,
  );

  const byAssessmentInstance = groupBy(
    instanceQuestions,
    (iq) => iq.instance_question.assessment_instance_id,
  );

  const allResults = await mapLimit(
    Object.entries(byAssessmentInstance),
    CONCURRENCY,
    async ([assessmentInstanceId, questions]: [string, InstanceQuestionQuery[]]) => {
      const userId = questions[0].user.id;

      const results = await mapLimit(questions, CONCURRENCY, async (instanceQuestion: InstanceQuestionQuery) => {
        const result = await processQuestion(instanceQuestion, ctx);
        return finalizeQuestion(instanceQuestion, result, ctx);
      });

      const allSucceeded = results.every((r) => r.attempts > 0);
      let closed = false;

      if (shouldClose && allSucceeded) {
        // We intentionally avoid `gradeAssessmentInstance` here because it calls
        // `gradeVariant` on all open variants, which would kick off the external
        // grader for externally-graded questions. Instead, we close the instance
        // and unset grading_needed directly.
        await closeAssessmentInstance({
          assessment_instance_id: assessmentInstanceId,
          authn_user_id: userId,
          client_fingerprint_id: null,
        });
        await execute(sql.set_assessment_instance_grading_needed, {
          assessment_instance_id: assessmentInstanceId,
          grading_needed: false,
        });
        closed = true;
      }

      return results.map((r) => buildResultRow(r, ctx, closed));
    },
  );

  return { rows: allResults.flat(), columns };
}

async function processQuestion(
  instanceQuestion: InstanceQuestionQuery,
  ctx: SharedContext,
): Promise<QuestionResult> {
  const { question, instance_question, user, question_course, assessment_question } =
    instanceQuestion;
  const maxAutoPoints = assessment_question.max_auto_points ?? 0;

  if (question.grading_method === 'External') {
    return processExternalQuestion(instanceQuestion, ctx);
  }

  // Auto-graded or manual-only: submit and grade up to maxAttempts times.
  // For manual-only questions gradeVariant is a no-op, so the loop runs
  // once and manual points are assigned in finalizeQuestion.
  let currentIq: InstanceQuestion = instance_question;
  let attempts = 0;
  let lastSubmissionId: string | null = null;
  let testType: TestType = ctx.testType === 'random' ? 'correct' : ctx.testType;

  for (let attempt = 0; attempt < ctx.maxAttempts; attempt++) {
    if (!currentIq.open || currentIq.status === 'complete') break;
    if (
      ctx.assessment.type === 'Homework' &&
      maxAutoPoints > 0 &&
      (currentIq.auto_points ?? 0) >= maxAutoPoints
    ) {
      break;
    }

    const { submissionData, variant, hasFatalIssue, currentTestType } =
      await createVariantAndSubmissionData({
        question,
        instance_question: currentIq,
        user,
        question_course,
        courseInstance: ctx.courseInstance,
        assessmentCourse: ctx.assessmentCourse,
        test_type: ctx.testType,
      });
    testType = currentTestType;
    if (hasFatalIssue) break;

    lastSubmissionId = await saveAndGradeSubmission(
      submissionData,
      variant,
      question,
      ctx.assessmentCourse,
      true,
      true,
    );
    attempts++;

    if (maxAutoPoints === 0) break;

    const iqRow = await queryOptionalRow(
      sql.select_instance_question_by_id,
      { instance_question_id: instance_question.id },
      InstanceQuestionRefetchSchema,
    );
    if (!iqRow) break;
    currentIq = iqRow.instance_question;
  }

  return { attempts, lastSubmissionId, testType };
}

async function processExternalQuestion(
  instanceQuestion: InstanceQuestionQuery,
  ctx: SharedContext,
): Promise<QuestionResult> {
  const { question, instance_question, user, question_course, assessment_question } =
    instanceQuestion;
  const maxAutoPoints = assessment_question.max_auto_points ?? 0;

  // External grading: save a submission without triggering the external
  // grader, then assign full auto points directly.
  const { submissionData, variant, hasFatalIssue, currentTestType } =
    await createVariantAndSubmissionData({
      question,
      instance_question,
      user,
      question_course,
      courseInstance: ctx.courseInstance,
      assessmentCourse: ctx.assessmentCourse,
      test_type: ctx.testType,
    });

  if (hasFatalIssue) {
    return { attempts: 0, lastSubmissionId: null, testType: currentTestType };
  }

  const { submission_id } = await saveSubmission(
    submissionData,
    variant,
    question,
    ctx.assessmentCourse,
  );

  if (maxAutoPoints > 0 && currentTestType !== 'invalid') {
    await updateInstanceQuestionScore({
      assessment: ctx.assessment,
      instance_question_id: instance_question.id,
      submission_id,
      check_modified_at: null,
      score: { auto_score_perc: currentTestType === 'correct' ? 100 : 0 },
      authn_user_id: user.id,
    });
  }

  return { attempts: 1, lastSubmissionId: submission_id, testType: currentTestType };
}

async function finalizeQuestion(
  instanceQuestion: InstanceQuestionQuery,
  result: QuestionResult,
  ctx: SharedContext,
): Promise<FinalizedInstanceQuestion> {
  const maxManualPoints = instanceQuestion.assessment_question.max_manual_points ?? 0;

  if (maxManualPoints > 0 && result.lastSubmissionId !== null) {
    await updateInstanceQuestionScore({
      assessment: ctx.assessment,
      instance_question_id: instanceQuestion.instance_question.id,
      submission_id: result.lastSubmissionId,
      check_modified_at: null,
      score: { manual_score_perc: result.testType === 'correct' ? 100 : 0 },
      authn_user_id: instanceQuestion.user.id,
    });
  }

  const refetchedRow = await queryRow(
    sql.select_instance_question_by_id,
    { instance_question_id: instanceQuestion.instance_question.id },
    InstanceQuestionRefetchSchema,
  );

  return {
    instanceQuestion,
    attempts: result.attempts,
    testType: result.testType,
    finalInstanceQuestion: refetchedRow.instance_question,
  };
}

function buildResultRow(
  result: FinalizedInstanceQuestion,
  ctx: SharedContext,
  closed: boolean,
): ResultRow {
  const { instanceQuestion, attempts, testType, finalInstanceQuestion } = result;
  return {
    course_instance_id: ctx.assessment.course_instance_id,
    course_instance: ctx.courseInstance.short_name ?? '',
    assessment_id: ctx.assessment.id,
    assessment: ctx.assessment.tid ?? ctx.assessment.id,
    assessment_instance_id: instanceQuestion.instance_question.assessment_instance_id,
    uid: instanceQuestion.user.uid,
    qid: instanceQuestion.question.qid ?? instanceQuestion.question.id,
    test_type: testType,
    attempts,
    auto_points: finalInstanceQuestion.auto_points,
    manual_points: finalInstanceQuestion.manual_points,
    max_auto_points: instanceQuestion.assessment_question.max_auto_points ?? 0,
    max_manual_points: instanceQuestion.assessment_question.max_manual_points ?? 0,
    status: finalInstanceQuestion.status,
    closed: closed ? 'true' : 'false',
  };
}

async function createVariantAndSubmissionData({
  question,
  instance_question,
  user,
  question_course,
  courseInstance,
  assessmentCourse,
  test_type,
}: {
  question: Question;
  instance_question: InstanceQuestion;
  user: User;
  question_course: Course;
  courseInstance: CourseInstance;
  assessmentCourse: Course;
  test_type: TestType | 'random';
}) {
  const variant = await ensureVariant({
    question_id: question.id,
    instance_question_id: instance_question.id,
    user_id: user.id,
    authn_user_id: user.id,
    course_instance: courseInstance,
    variant_course: assessmentCourse,
    question_course,
    options: { variant_seed: null },
    require_open: true,
    client_fingerprint_id: null,
  });

  const currentTestType =
    test_type === 'random' ? TEST_TYPES[Math.floor(Math.random() * TEST_TYPES.length)] : test_type;

  const { data, hasFatalIssue } = await createTestSubmissionData(
    variant,
    question,
    assessmentCourse,
    currentTestType,
    user.id,
    user.id,
  );

  return {
    submissionData: {
      ...data,
      auth_user_id: user.id,
      user_id: user.id,
      variant_id: variant.id,
      submitted_answer: data.raw_submitted_answer,
      credit: 100,
    },
    variant,
    hasFatalIssue,
    currentTestType,
  };
}
