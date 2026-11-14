import { z } from 'zod';

import { CourseDataQuerySchema, courseDataQuerySchema } from '@prairielearn/course-agent-types';
import { loadSqlEquiv } from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import {
  EnumAssessmentTypeSchema,
  EnumGradingMethodSchema,
  EnumInstanceQuestionStatusSchema,
  EnumModeSchema,
} from '../../../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);

// Rows are JSON: IDs are strings, as in the rest of the API, and timestamps are ISO 8601 in UTC.
const TimestampSchema = z.iso.datetime();

// The names the course files use, so a row can be matched to its files without another download.
const CourseInstanceShortNameSchema = z
  .string()
  .describe("The course instance's directory name in the course files, under courseInstances/.");
const AssessmentTidSchema = z
  .string()
  .nullable()
  .describe("The assessment's directory within its course instance's assessments/ directory.");
const QidSchema = z
  .string()
  .nullable()
  .describe("The question's directory within the course's questions/ directory.");

// PrairieLearn no longer uses the SEB mode, so it isn't offered.
const ModeSchema = EnumModeSchema.exclude(['SEB']);

// A JSON object from a jsonb column, such as a question's parameters.
const JsonObjectSchema = z.record(z.string(), z.unknown());

function dataset<Shape extends Record<string, z.ZodType>>({
  description,
  query,
  schema,
  largeColumns = [],
}: {
  description: string;
  query: string;
  schema: z.ZodObject<Shape>;
  /** Columns whose values can be large, so rows that include them are read a few at a time. */
  largeColumns?: (keyof Shape & string)[];
}) {
  return {
    description,
    query,
    schema,
    largeColumns: new Set<string>(largeColumns),
    querySchema: courseDataQuerySchema(z.enum(Object.keys(schema.shape) as [keyof Shape & string])),
  };
}

/**
 * The course data datasets: the single source of truth for what the course agent can read. The
 * router and the request schemas are derived from this registry, and a test checks that each query
 * returns exactly its schema's columns. Within v1, only add datasets and columns; a removal,
 * rename, or change in meaning needs a new version, since a running conversation may still use
 * an older Worker.
 */
export const COURSE_DATA_DATASETS = {
  course_instances: dataset({
    description: 'Offerings of the course, each with its own students and assessments.',
    query: sql.select_course_instances_by_course_id,
    schema: z.object({
      id: IdSchema,
      short_name: CourseInstanceShortNameSchema,
      long_name: z.string().nullable().describe('Long name of the course instance.'),
      display_timezone: z
        .string()
        .describe(
          'Timezone for all date input and display in the course instance, as an IANA identifier.',
        ),
      publishing_start_date: TimestampSchema.nullable().describe(
        'When students can first access the course instance. Null when access is set by legacy allowAccess rules.',
      ),
      publishing_end_date: TimestampSchema.nullable().describe(
        'When students lose access to the course instance. Null when access is set by legacy allowAccess rules.',
      ),
    }),
  }),
  assessments: dataset({
    description: 'Assessments in each course instance.',
    query: sql.select_assessments_by_course_id,
    schema: z.object({
      id: IdSchema,
      course_instance_id: IdSchema,
      course_instance_short_name: CourseInstanceShortNameSchema,
      tid: AssessmentTidSchema,
      title: z.string().nullable().describe('Title of the assessment.'),
      label: z
        .string()
        .describe(
          'Short label shown to students, made of the assessment set abbreviation and number.',
        ),
      set_name: z
        .string()
        .nullable()
        .describe('Name of the assessment set the assessment belongs to.'),
      number: z.string().describe('Number of the assessment within its set.'),
      type: EnumAssessmentTypeSchema.describe(
        'Homework: students can retry questions on new variants to earn points. Exam: each question has a list of point values for successive tries, and attempts are often timed or proctored.',
      ),
      max_points: z
        .number()
        .nullable()
        .describe(
          'Points needed for a score of 100%. Can be null for an assessment no student has started; every attempt in assessment_instances has it.',
        ),
      max_bonus_points: z
        .number()
        .nullable()
        .describe('Additional points that can be earned beyond max_points.'),
      multiple_instance: z
        .boolean()
        .describe('Whether students can start additional attempts at the assessment.'),
      team_work: z.boolean().describe('Whether students take the assessment in teams.'),
    }),
  }),
  questions: dataset({
    description: 'Questions in the course question bank.',
    query: sql.select_questions_by_course_id,
    schema: z.object({
      id: IdSchema,
      qid: QidSchema,
      title: z.string().nullable().describe('Title of the question.'),
      topic: z.string().nullable().describe('Category the question belongs to.'),
      grading_method: EnumGradingMethodSchema.describe(
        "The question's default grading method. An assessment can grade the question differently; see max_auto_points and max_manual_points in assessment_questions.",
      ),
      single_variant: z
        .boolean()
        .nullable()
        .describe('Whether the question is not randomized and only generates a single variant.'),
      draft: z.boolean().describe('Whether the question is an unfinished draft.'),
    }),
  }),
  assessment_questions: dataset({
    description:
      'Questions as placed on an assessment, with their points and statistics. The statistics cover attempts that count in statistics and are recalculated every few minutes, so the latest activity may be missing.',
    query: sql.select_assessment_questions_by_course_id,
    schema: z.object({
      id: IdSchema,
      course_instance_id: IdSchema,
      course_instance_short_name: CourseInstanceShortNameSchema,
      assessment_id: IdSchema,
      assessment_tid: AssessmentTidSchema,
      question_id: IdSchema,
      qid: QidSchema,
      number: z.number().nullable().describe('Position of the question on the assessment, from 1.'),
      max_points: z
        .number()
        .nullable()
        .describe(
          'Most points a student can earn on the question, from automatic and manual grading.',
        ),
      max_auto_points: z.number().nullable().describe('Points available from automatic grading.'),
      max_manual_points: z.number().nullable().describe('Points available from manual grading.'),
      mean_question_score: z
        .number()
        .nullable()
        .describe('Mean score of students on the question, from 0 to 100.'),
      discrimination: z
        .number()
        .nullable()
        .describe(
          "Correlation between students' scores on this question and on the whole assessment, times 100, from -100 to 100. Low values mean the question doesn't separate stronger from weaker students.",
        ),
    }),
  }),
  assessment_instances: dataset({
    description:
      'Attempts at assessments by students or teams, with totals. An assessment with multiple_instance can have several attempts per student.',
    query: sql.select_assessment_instances_by_course_id,
    schema: z.object({
      id: IdSchema,
      course_instance_id: IdSchema,
      course_instance_short_name: CourseInstanceShortNameSchema,
      assessment_id: IdSchema,
      assessment_tid: AssessmentTidSchema,
      user_id: IdSchema.nullable().describe('Student who owns the attempt. Null for team work.'),
      team_id: IdSchema.nullable().describe(
        'Team that owns the attempt. Null for individual work.',
      ),
      number: z.number().describe('Attempt number for this student and assessment, from 1.'),
      mode: ModeSchema.nullable().describe(
        'Where the attempt was started: Public for normal access, or Exam in a proctored exam session (such as PrairieTest).',
      ),
      open: z.boolean().describe('Whether the attempt still accepts answers.'),
      started_at: TimestampSchema.nullable().describe('When the attempt started.'),
      closed_at: TimestampSchema.nullable().describe('When the attempt closed. Null while open.'),
      duration: z
        .number()
        .nullable()
        .describe(
          "Estimated time spent on the attempt, in seconds: the time between the student's actions, skipping gaps over an hour.",
        ),
      points: z.number().nullable().describe('Points earned on the attempt.'),
      max_points: z.number().nullable().describe('Points needed for a score of 100%.'),
      score_perc: z
        .number()
        .nullable()
        .describe('Score from 0 to 100, which bonus points can exceed.'),
      include_in_statistics: z
        .boolean()
        .describe(
          'Whether the attempt counts in assessment statistics. False for attempts started by course staff.',
        ),
    }),
  }),
  instance_questions: dataset({
    description: "Questions in a student's assessment attempt, with their scores.",
    query: sql.select_instance_questions_by_course_id,
    schema: z.object({
      id: IdSchema,
      course_instance_id: IdSchema,
      course_instance_short_name: CourseInstanceShortNameSchema,
      assessment_id: IdSchema,
      assessment_tid: AssessmentTidSchema,
      assessment_instance_id: IdSchema,
      include_in_statistics: z
        .boolean()
        .describe(
          'Whether the attempt counts in assessment statistics. False for attempts started by course staff.',
        ),
      assessment_question_id: IdSchema,
      question_id: IdSchema,
      qid: QidSchema,
      number: z.number().nullable().describe('Position of the question in the attempt.'),
      status: EnumInstanceQuestionStatusSchema.nullable().describe(
        'unanswered: no submission. saved: answer saved but not graded. grading: waiting for an external grader. invalid: the latest answer could not be graded. incorrect: graded, never fully correct. correct: a submission was fully correct and more points are available. complete: no more points are available, from full points or no tries left, so it does not mean correct.',
      ),
      points: z
        .number()
        .nullable()
        .describe('Points earned on the question, from automatic and manual grading.'),
      auto_points: z.number().nullable().describe('Points earned from automatic grading.'),
      manual_points: z.number().nullable().describe('Points earned from manual grading.'),
      score_perc: z.number().nullable().describe('Score on the question, from 0 to 100.'),
      highest_submission_score: z
        .number()
        .nullable()
        .describe('Best submission score, from 0 to 1.'),
      requires_manual_grading: z.boolean().describe('Whether manual grading is pending.'),
      duration: z
        .number()
        .nullable()
        .describe(
          "Estimated time spent on the question, in seconds: the time between the student's actions, skipping gaps over an hour.",
        ),
      created_at: TimestampSchema.nullable().describe(
        'When the question was added to the attempt.',
      ),
    }),
  }),
  variants: dataset({
    description:
      'Generated versions of a question that students saw. Instructor previews are excluded.',
    query: sql.select_variants_by_course_id,
    schema: z.object({
      id: IdSchema,
      course_instance_id: IdSchema,
      course_instance_short_name: CourseInstanceShortNameSchema,
      assessment_id: IdSchema,
      assessment_tid: AssessmentTidSchema,
      instance_question_id: IdSchema,
      question_id: IdSchema,
      qid: QidSchema,
      user_id: IdSchema.nullable().describe(
        'Student the variant was generated for. Null for team work.',
      ),
      team_id: IdSchema.nullable().describe(
        'Team the variant was generated for. Null for individual work.',
      ),
      number: z
        .number()
        .nullable()
        .describe('Number of the variant among those generated for the question in the attempt.'),
      created_at: TimestampSchema.nullable().describe('When the variant was generated.'),
      open: z.boolean().nullable().describe('Whether the variant still accepts submissions.'),
      broken: z
        .boolean()
        .describe(
          "Whether the question's code failed for the variant, so students couldn't use it.",
        ),
      params: JsonObjectSchema.nullable().describe(
        'Parameters the question generated for the variant. Can be large.',
      ),
      true_answer: JsonObjectSchema.nullable().describe(
        'Correct answer for the variant, keyed by answer name. Can be large.',
      ),
    }),
    largeColumns: ['params', 'true_answer'],
  }),
  submissions: dataset({
    description: 'Student answer submissions. Instructor previews are excluded.',
    query: sql.select_submissions_by_course_id,
    schema: z.object({
      id: IdSchema,
      course_instance_id: IdSchema,
      course_instance_short_name: CourseInstanceShortNameSchema,
      assessment_id: IdSchema,
      assessment_tid: AssessmentTidSchema,
      assessment_instance_id: IdSchema,
      instance_question_id: IdSchema,
      question_id: IdSchema,
      qid: QidSchema,
      variant_id: IdSchema,
      user_id: IdSchema.nullable().describe(
        'Student who submitted the answer. Null for team work.',
      ),
      team_id: IdSchema.nullable().describe(
        'Team that submitted the answer. Null for individual work.',
      ),
      submitted_at: TimestampSchema.nullable().describe('When the answer was submitted.'),
      mode: ModeSchema.nullable().describe(
        'Where the answer was submitted: Public for normal access, or Exam in a proctored exam session (such as PrairieTest).',
      ),
      gradable: z
        .boolean()
        .nullable()
        .describe('Whether the answer could be graded. False when it had format errors.'),
      broken: z
        .boolean()
        .nullable()
        .describe("Whether the question's code failed while grading the answer."),
      graded_at: TimestampSchema.nullable().describe(
        'When the submission was graded. Null if not graded.',
      ),
      score: z
        .number()
        .nullable()
        .describe(
          'Score from 0 to 1, including any score staff set in manual grading. Null if not graded. Manual grading points are in instance_questions.manual_points.',
        ),
      correct: z
        .boolean()
        .nullable()
        .describe('Whether the submission was fully correct. Null if not graded.'),
      overridden: z.boolean().describe('Whether staff manually overrode the score.'),
      credit: z
        .number()
        .nullable()
        .describe(
          "Credit percentage from the assessment's access rules at submission time, which scales the points earned, such as 50 for a late submission.",
        ),
      submitted_answer: JsonObjectSchema.nullable().describe(
        'The answer, keyed by answer name. Uploaded files are omitted. Can be large.',
      ),
      format_errors: JsonObjectSchema.nullable().describe(
        'Why parts of the answer could not be parsed, keyed by answer name.',
      ),
      partial_scores: JsonObjectSchema.nullable().describe(
        'Score of each graded answer part, keyed by answer name. Can be large.',
      ),
      feedback: JsonObjectSchema.nullable().describe(
        'Feedback from grading, such as autograder results. Can be large.',
      ),
    }),
    largeColumns: ['submitted_answer', 'partial_scores', 'feedback'],
  }),
};

type CourseDatasetName = keyof typeof COURSE_DATA_DATASETS;

export function isCourseDataset(name: string): name is CourseDatasetName {
  return Object.hasOwn(COURSE_DATA_DATASETS, name);
}

const COURSE_DATA_VERSION = 1;

/** Columns are serialized JSON, so an ID is a string of digits. */
function toJsonSchema(schema: z.ZodType) {
  return z.toJSONSchema(schema, {
    unrepresentable: 'any',
    override: ({ zodSchema, jsonSchema }) => {
      if (zodSchema !== IdSchema) return;
      for (const key of Object.keys(jsonSchema)) delete jsonSchema[key];
      Object.assign(jsonSchema, { type: 'string', pattern: '^\\d+$' });
    },
  });
}

/** The dataset list endpoint's response. */
export function courseDataSchema() {
  return {
    version: COURSE_DATA_VERSION,
    query: toJsonSchema(CourseDataQuerySchema),
    datasets: Object.fromEntries(
      Object.entries(COURSE_DATA_DATASETS).map(([name, dataset]) => [
        name,
        { description: dataset.description, schema: toJsonSchema(dataset.schema) },
      ]),
    ),
  };
}
