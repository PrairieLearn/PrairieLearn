import { mapSeries } from 'async';
import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';
import { execute, loadSqlEquiv, queryOptionalRow, queryRows } from '@prairielearn/postgres';

import { closeAssessmentInstance } from '../lib/assessment.js';
import { config } from '../lib/config.js';
import {
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
  const maxAttempts = Number.isNaN(parsed) ? 10 : parsed;
  const shouldClose = close_str === 'true';

  const instanceQuestions = await queryRows(
    sql.select_instance_questions,
    { assessment_id },
    InstanceQuestionQuerySchema,
  );

  // Group instance questions by assessment instance for closing later.
  const instanceQuestionsByAssessmentInstance = new Map<string, InstanceQuestionQuery[]>();
  for (const iq of instanceQuestions) {
    const aiId = iq.instance_question.assessment_instance_id;
    const list = instanceQuestionsByAssessmentInstance.get(aiId) ?? [];
    list.push(iq);
    instanceQuestionsByAssessmentInstance.set(aiId, list);
  }

  const rows: ResultRow[] = [];

  for (const [assessmentInstanceId, questions] of instanceQuestionsByAssessmentInstance) {
    const userId = questions[0].user.id;

    const questionRows = await mapSeries(
      questions,
      async ({
        question,
        instance_question,
        user,
        question_course,
        assessment_question,
      }: InstanceQuestionQuery): Promise<ResultRow> => {
        const maxAutoPoints = assessment_question.max_auto_points ?? 0;
        const maxManualPoints = assessment_question.max_manual_points ?? 0;
        const isExternal = question.grading_method === 'External';

        let attempts = 0;
        let lastSubmissionId: string | null = null;
        let actualTestType: TestType = test_type === 'random' ? 'correct' : test_type;

        if (isExternal) {
          // External grading: save a submission without triggering the external
          // grader, then assign full auto points directly.
          const { submissionData, variant, hasFatalIssue, currentTestType } =
            await createVariantAndSubmissionData({
              question,
              instance_question,
              user,
              question_course,
              courseInstance,
              assessmentCourse,
              test_type,
            });
          actualTestType = currentTestType;

          if (!hasFatalIssue) {
            const result = await saveSubmission(
              submissionData,
              variant,
              question,
              assessmentCourse,
            );
            lastSubmissionId = result.submission_id;
            attempts = 1;
          }

          if (maxAutoPoints > 0 && !hasFatalIssue && currentTestType !== 'invalid') {
            await updateInstanceQuestionScore({
              assessment,
              instance_question_id: instance_question.id,
              submission_id: lastSubmissionId,
              check_modified_at: null,
              score: { auto_score_perc: currentTestType === 'correct' ? 100 : 0 },
              authn_user_id: user.id,
            });
          }
        } else {
          // Auto-graded or manual-only: submit and grade up to maxAttempts
          // times. For manual-only questions gradeVariant is a no-op, so
          // the loop runs once and we assign manual points below.
          let currentIq: InstanceQuestion = instance_question;
          for (let attempt = 0; attempt < maxAttempts; attempt++) {
            if (!currentIq.open || currentIq.status === 'complete') break;
            if (
              assessment.type === 'Homework' &&
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
                courseInstance,
                assessmentCourse,
                test_type,
              });
            actualTestType = currentTestType;
            if (hasFatalIssue) break;

            lastSubmissionId = await saveAndGradeSubmission(
              submissionData,
              variant,
              question,
              assessmentCourse,
              true,
              true,
            );
            attempts++;

            if (maxAutoPoints === 0) break;

            // Re-fetch to check if the question is now closed/complete.
            const iqRow = await queryOptionalRow(
              sql.select_instance_question_by_id,
              { instance_question_id: instance_question.id },
              InstanceQuestionRefetchSchema,
            );
            if (!iqRow) break;
            currentIq = iqRow.instance_question;
          }
        }

        // Assign manual points based on test type. Skip if no submission was
        // created (e.g. the question had a fatal issue).
        if (maxManualPoints > 0 && lastSubmissionId !== null) {
          const manualScorePerc = actualTestType === 'correct' ? 100 : 0;
          await updateInstanceQuestionScore({
            assessment,
            instance_question_id: instance_question.id,
            submission_id: lastSubmissionId,
            check_modified_at: null,
            score: { manual_score_perc: manualScorePerc },
            authn_user_id: user.id,
          });
        }

        // Re-fetch final state for output.
        const finalIqRow = await queryOptionalRow(
          sql.select_instance_question_by_id,
          { instance_question_id: instance_question.id },
          InstanceQuestionRefetchSchema,
        );
        const finalIq = finalIqRow?.instance_question;

        return {
          course_instance_id: assessment.course_instance_id,
          course_instance: courseInstance.short_name ?? '',
          assessment_id: assessment.id,
          assessment: assessment.tid ?? assessment.id,
          assessment_instance_id: instance_question.assessment_instance_id,
          uid: user.uid,
          qid: question.qid ?? question.id,
          test_type: actualTestType,
          attempts,
          auto_points: finalIq?.auto_points ?? 0,
          manual_points: finalIq?.manual_points ?? 0,
          max_auto_points: maxAutoPoints,
          max_manual_points: maxManualPoints,
          status: finalIq?.status ?? 'unknown',
          closed: null,
        };
      },
    );

    rows.push(...questionRows);

    // Close the assessment instance after all questions are handled.
    // Skip closing if any question failed to produce a submission (attempts=0),
    // so the tool can be re-run to retry those questions.
    const allQuestionsSucceeded = questionRows.every((row) => (row.attempts as number) > 0);
    let closed = false;

    if (shouldClose && allQuestionsSucceeded) {
      try {
        await closeAssessmentInstance({
          assessment_instance_id: assessmentInstanceId,
          authn_user_id: userId,
          client_fingerprint_id: null,
        });
        // All grading is already done; clear the flag so autoFinishExams doesn't re-grade.
        await execute(sql.unset_grading_needed, {
          assessment_instance_id: assessmentInstanceId,
        });
        closed = true;
      } catch (err) {
        if (
          err instanceof HttpStatusError &&
          err.status === 403 &&
          err.message.includes('not open')
        ) {
          // Assessment instance is already closed; ignore.
          closed = true;
        } else {
          throw err;
        }
      }
    }

    for (const row of questionRows) {
      row.closed = closed ? 'true' : 'false';
    }
  }

  return { rows, columns };
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
