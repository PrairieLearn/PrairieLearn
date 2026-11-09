import { z } from 'zod';

import { loadSqlEquiv } from '@prairielearn/postgres';

const sql = loadSqlEquiv(import.meta.url);

// Wire types: what a row looks like after JSON serialization. IDs are strings, as in the rest of
// the API, and timestamps are ISO 8601 strings in UTC.
const id = (description: string) => z.string().regex(/^\d+$/).describe(description);
const timestamp = (description: string) => z.iso.datetime().describe(description);
const seconds = (description: string) => z.number().describe(`${description} In seconds.`);

/**
 * The course data API's datasets: the single source of truth for what the API exposes. The router,
 * the schema endpoint, and the committed JSON Schema are derived from this registry, and a test
 * checks that each query returns exactly its schema's columns. Within v1, only add datasets and
 * columns; a removal, rename, or change in meaning needs a new version.
 */
export const COURSE_DATA_DATASETS = {
  course_instances: {
    description: 'Course instances (offerings of the course, such as a semester).',
    query: sql.course_instances,
    schema: z.object({
      id: id('Course instance ID.'),
      short_name: z.string().describe('Directory name under courseInstances/, such as Fa25.'),
      long_name: z.string().nullable().describe('Display name, such as "Fall 2025".'),
      display_timezone: z
        .string()
        .describe('IANA timezone for dates in this course instance, such as America/Chicago.'),
      publishing_start_date: timestamp('When students can first access the instance.').nullable(),
      publishing_end_date: timestamp('When student access ends.').nullable(),
    }),
  },
  assessments: {
    description: 'Assessments (homeworks, quizzes, exams) in each course instance.',
    query: sql.assessments,
    schema: z.object({
      id: id('Assessment ID.'),
      course_instance_id: id('Course instance the assessment belongs to.'),
      tid: z.string().nullable().describe('Directory name under the instance assessments/.'),
      title: z.string().nullable().describe('Assessment title.'),
      label: z.string().describe('Short label shown to students, such as HW3 or Q4.'),
      set_name: z.string().nullable().describe('Assessment set name, such as Homework or Quiz.'),
      number: z.string().describe('Number within the assessment set.'),
      type: z.enum(['Homework', 'Exam', 'RetryExam', 'Basic', 'Game']).describe('Assessment type.'),
      max_points: z.number().nullable().describe('Points needed for a score of 100%.'),
      max_bonus_points: z.number().nullable().describe('Extra points available beyond 100%.'),
      multiple_instance: z.boolean().describe('Whether a student can start more than one attempt.'),
      team_work: z.boolean().describe('Whether students work in teams (groups).'),
    }),
  },
  questions: {
    description: 'Questions in the course question bank.',
    query: sql.questions,
    schema: z.object({
      id: id('Question ID.'),
      qid: z.string().nullable().describe('Directory path under questions/.'),
      title: z.string().nullable().describe('Question title.'),
      topic: z.string().nullable().describe('Topic name.'),
      grading_method: z
        .enum(['Internal', 'External', 'Manual', 'AI'])
        .describe('How submissions are graded.'),
      single_variant: z
        .boolean()
        .nullable()
        .describe('Whether every student sees the same variant.'),
      draft: z.boolean().describe('Whether the question is a draft.'),
    }),
  },
  assessment_questions: {
    description:
      'Questions as placed on an assessment, with per-assessment points and statistics. Statistics are precomputed and can be out of date.',
    query: sql.assessment_questions,
    schema: z.object({
      id: id('Assessment question ID.'),
      course_instance_id: id('Course instance.'),
      assessment_id: id('Assessment.'),
      question_id: id('Question.'),
      number: z.number().nullable().describe('Position on the assessment.'),
      max_points: z.number().nullable().describe('Total points available for this question.'),
      max_auto_points: z.number().nullable().describe('Points available from automatic grading.'),
      max_manual_points: z.number().nullable().describe('Points available from manual grading.'),
      mean_question_score: z
        .number()
        .nullable()
        .describe('Precomputed mean score from 0 to 100 across students.'),
      discrimination: z
        .number()
        .nullable()
        .describe(
          'Precomputed correlation (0 to 100) between this score and the assessment score.',
        ),
      average_number_submissions: z
        .number()
        .nullable()
        .describe('Precomputed mean number of submissions per student.'),
    }),
  },
  assessment_instances: {
    description:
      "Students' (or teams') attempts at assessments, with totals. One row per attempt; an assessment with multiple_instance can have several per student.",
    query: sql.assessment_instances,
    schema: z.object({
      id: id('Assessment instance ID.'),
      course_instance_id: id('Course instance.'),
      assessment_id: id('Assessment.'),
      user_id: id('Student who owns the attempt; null for team work.').nullable(),
      team_id: id('Team that owns the attempt; null for individual work.').nullable(),
      number: z.number().describe('Attempt number for this student and assessment, from 1.'),
      mode: z.enum(['Public', 'Exam', 'SEB']).nullable().describe('Where the attempt was taken.'),
      open: z.boolean().describe('Whether the attempt is still open.'),
      started_at: timestamp('When the attempt started.').nullable(),
      closed_at: timestamp('When the attempt closed.').nullable(),
      duration: seconds('Time spent on the attempt.').nullable(),
      points: z.number().nullable().describe('Points earned.'),
      max_points: z.number().nullable().describe('Points needed for 100%.'),
      score_perc: z
        .number()
        .nullable()
        .describe('Score from 0 to 100 (can exceed 100 with bonus points).'),
      include_in_statistics: z
        .boolean()
        .describe('False for staff and other attempts excluded from assessment statistics.'),
    }),
  },
  instance_questions: {
    description: "One row per question in a student's assessment attempt, with its score.",
    query: sql.instance_questions,
    schema: z.object({
      id: id('Instance question ID.'),
      course_instance_id: id('Course instance.'),
      assessment_id: id('Assessment.'),
      assessment_instance_id: id('Assessment attempt.'),
      assessment_question_id: id('Question as placed on the assessment.'),
      question_id: id('Question.'),
      number: z.number().nullable().describe('Position in the attempt.'),
      status: z
        .enum(['complete', 'unanswered', 'saved', 'correct', 'incorrect', 'grading', 'invalid'])
        .nullable()
        .describe('Current status.'),
      points: z.number().nullable().describe('Points earned (auto plus manual).'),
      auto_points: z.number().nullable().describe('Points from automatic grading.'),
      manual_points: z.number().nullable().describe('Points from manual grading.'),
      score_perc: z.number().nullable().describe('Score from 0 to 100.'),
      number_attempts: z
        .number()
        .describe(
          'Attempt counter kept by some grading paths; can be 0 even when submissions exist. Count rows in submissions for the number of submissions.',
        ),
      highest_submission_score: z
        .number()
        .nullable()
        .describe('Best submission score from 0 to 1.'),
      requires_manual_grading: z.boolean().describe('Whether manual grading is pending.'),
      duration: seconds('Time spent on the question.').nullable(),
      created_at: timestamp('When the question was added to the attempt.').nullable(),
    }),
  },
  variants: {
    description:
      'Generated versions of a question that students saw. Instructor previews are excluded.',
    query: sql.variants,
    schema: z.object({
      id: id('Variant ID.'),
      course_instance_id: id('Course instance.'),
      assessment_id: id('Assessment.'),
      instance_question_id: id('Instance question.'),
      question_id: id('Question.'),
      user_id: id('Student; null for team work.').nullable(),
      team_id: id('Team; null for individual work.').nullable(),
      number: z.number().nullable().describe('Variant number within the instance question.'),
      created_at: timestamp('When the variant was generated.').nullable(),
      open: z.boolean().nullable().describe('Whether more submissions are accepted.'),
      broken: z.boolean().describe('Whether the variant was marked broken.'),
    }),
  },
  submissions: {
    description:
      'Student answer submissions, one row per submission, without answer contents. Instructor previews are excluded.',
    query: sql.submissions,
    schema: z.object({
      id: id('Submission ID.'),
      course_instance_id: id('Course instance.'),
      assessment_id: id('Assessment.'),
      assessment_instance_id: id('Assessment attempt.'),
      instance_question_id: id('Instance question.'),
      question_id: id('Question.'),
      variant_id: id('Variant.'),
      user_id: id('Student; null for team work.').nullable(),
      team_id: id('Team; null for individual work.').nullable(),
      submitted_at: timestamp('When the student submitted.').nullable(),
      mode: z.enum(['Public', 'Exam', 'SEB']).nullable().describe('Where it was submitted.'),
      gradable: z.boolean().nullable().describe('False when the answer had format errors.'),
      broken: z.boolean().nullable().describe('Whether grading hit an error.'),
      graded_at: timestamp('When grading finished; null if not graded.').nullable(),
      score: z
        .number()
        .nullable()
        .describe('Score from 0 to 1, after any manual override; null if not graded.'),
      correct: z.boolean().nullable().describe('Whether the submission was fully correct.'),
      overridden: z.boolean().describe('Whether staff manually overrode the score.'),
      credit: z
        .number()
        .nullable()
        .describe('Credit percentage applied at submission time, such as 100 or 80.'),
    }),
  },
};

export type CourseDatasetName = keyof typeof COURSE_DATA_DATASETS;

export function isCourseDataset(name: string): name is CourseDatasetName {
  return Object.hasOwn(COURSE_DATA_DATASETS, name);
}

export const COURSE_DATA_VERSION = 1;

/** The schema endpoint's response, also committed as JSON Schema for review. */
export function courseDataSchema() {
  return {
    version: COURSE_DATA_VERSION,
    datasets: Object.fromEntries(
      Object.entries(COURSE_DATA_DATASETS).map(([name, dataset]) => [
        name,
        { description: dataset.description, schema: z.toJSONSchema(dataset.schema) },
      ]),
    ),
  };
}
