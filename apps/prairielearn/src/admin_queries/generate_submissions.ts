import { mapSeries } from 'async';
import { z } from 'zod';

import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import { config } from '../lib/config.js';
import {
  CourseSchema,
  InstanceQuestionSchema,
  QuestionSchema,
  UserSchema,
} from '../lib/db-types.js';
import { saveSubmission } from '../lib/grading.js';
import { TEST_TYPES, type TestType, createTestSubmissionData } from '../lib/question-testing.js';
import { ensureVariant } from '../lib/question-variant.js';
import { selectOptionalAssessmentById } from '../models/assessment.js';
import { selectOptionalCourseInstanceById } from '../models/course-instances.js';
import { selectCourseById } from '../models/course.js';

import { type AdministratorQueryResult, type AdministratorQuerySpecs } from './lib/util.js';

export const specs: AdministratorQuerySpecs = {
  description:
    'Creates a random submission for each assessment instance in an assessment. Assessment instances must already exist and be open. Submission is saved, but not graded.',
  enabled: config.devMode, // This query is dangerous in production environments, so it is only enabled in dev mode
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
  'submission_id',
] as const;
type ResultRow = Record<(typeof columns)[number], string | number | null>;

const InstanceQuestionQuerySchema = z.object({
  instance_question: InstanceQuestionSchema,
  question: QuestionSchema,
  user: UserSchema,
  question_course: CourseSchema,
});
type InstanceQuestionQuery = z.infer<typeof InstanceQuestionQuerySchema>;

export default async function ({
  assessment_id,
  test_type,
}: {
  assessment_id: string;
  test_type: TestType | 'random';
}): Promise<AdministratorQueryResult> {
  const assessment = await selectOptionalAssessmentById(assessment_id);
  if (!assessment) return { rows: [], columns };
  const courseInstance = await selectOptionalCourseInstanceById(assessment.course_instance_id);
  if (!courseInstance) return { rows: [], columns };
  const assessmentCourse = await selectCourseById(courseInstance.course_id);

  const instanceQuestions = await queryRows(
    sql.select_instance_questions,
    { assessment_id },
    InstanceQuestionQuerySchema,
  );

  const rows = await mapSeries(
    instanceQuestions,
    async ({
      question,
      instance_question,
      user,
      question_course,
    }: InstanceQuestionQuery): Promise<ResultRow> => {
      // Select an existing open variant, or create a new one if none exists.
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
        test_type === 'random'
          ? TEST_TYPES[Math.floor(Math.random() * TEST_TYPES.length)]
          : test_type;
      // Create a new submission for the variant.
      const { data, hasFatalIssue } = await createTestSubmissionData(
        variant,
        question,
        assessmentCourse,
        currentTestType,
        user.id,
        user.id,
      );
      const { submission_id } = hasFatalIssue
        ? { submission_id: null } // If there is a fatal issue on test, we don't save the submission.
        : await saveSubmission(
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

      return {
        course_instance_id: assessment.course_instance_id,
        course_instance: courseInstance.short_name ?? '',
        assessment_id: assessment.id,
        assessment: assessment.tid ?? assessment.id,
        assessment_instance_id: instance_question.assessment_instance_id,
        uid: user.uid,
        qid: question.qid ?? question.id,
        test_type: currentTestType,
        submission_id,
      };
    },
  );

  return { rows, columns };
}
