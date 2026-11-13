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
      short_name: z.string().describe('Short unique identifier for the course instance.'),
      long_name: z.string().nullable().describe('Long name of the course instance.'),
      display_timezone: z
        .string()
        .describe(
          'Timezone for all date input and display in the course instance, as an IANA identifier.',
        ),
      publishing_start_date: TimestampSchema.nullable().describe(
        'When students can first access the course instance.',
      ),
      publishing_end_date: TimestampSchema.nullable().describe(
        'When students lose access to the course instance.',
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
      tid: z
        .string()
        .nullable()
        .describe('Short unique identifier for the assessment within its course instance.'),
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
        'Type of the assessment, which determines how students attempt questions and earn points.',
      ),
      max_points: z.number().nullable().describe('Points that must be earned to score 100%.'),
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
      qid: z
        .string()
        .nullable()
        .describe('Short unique identifier for the question within the course.'),
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
      'Questions as placed on an assessment, with their points and statistics. Statistics are precomputed and can be out of date.',
    query: sql.select_assessment_questions_by_course_id,
    schema: z.object({
      id: IdSchema,
      course_instance_id: IdSchema,
      course_instance_short_name: CourseInstanceShortNameSchema,
      assessment_id: IdSchema,
      assessment_tid: AssessmentTidSchema,
      question_id: IdSchema,
      qid: QidSchema,
      number: z.number().nullable().describe('Position of the question on the assessment.'),
      max_points: z
        .number()
        .nullable()
        .describe('Maximum points for the question on the assessment.'),
      max_auto_points: z.number().nullable().describe('Points available from automatic grading.'),
      max_manual_points: z.number().nullable().describe('Points available from manual grading.'),
      mean_question_score: z
        .number()
        .nullable()
        .describe('Mean score of students on the question, from 0 to 100.'),
      discrimination: z
        .number()
        .nullable()
        .describe('Correlation between this score and the assessment score, from 0 to 100.'),
      average_number_submissions: z
        .number()
        .nullable()
        .describe('Mean number of submissions per student.'),
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
      mode: EnumModeSchema.nullable().describe('Server mode the attempt was started in.'),
      open: z.boolean().describe('Whether the attempt still accepts answers.'),
      started_at: TimestampSchema.nullable().describe('When the attempt started.'),
      closed_at: TimestampSchema.nullable().describe('When the attempt closed.'),
      duration: z.number().nullable().describe('Time spent on the attempt, in seconds.'),
      points: z.number().nullable().describe('Points earned on the attempt.'),
      max_points: z.number().nullable().describe('Points needed for a score of 100%.'),
      score_perc: z
        .number()
        .nullable()
        .describe('Score from 0 to 100, which bonus points can exceed.'),
      include_in_statistics: z
        .boolean()
        .describe('False for staff attempts and others excluded from assessment statistics.'),
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
          'Whether the attempt counts in assessment statistics. False for staff attempts and others excluded.',
        ),
      assessment_question_id: IdSchema,
      question_id: IdSchema,
      qid: QidSchema,
      number: z.number().nullable().describe('Position of the question in the attempt.'),
      status: EnumInstanceQuestionStatusSchema.nullable().describe(
        'Grading status of the question in the attempt.',
      ),
      points: z
        .number()
        .nullable()
        .describe('Points earned on the question, from automatic and manual grading.'),
      auto_points: z.number().nullable().describe('Points earned from automatic grading.'),
      manual_points: z.number().nullable().describe('Points earned from manual grading.'),
      score_perc: z.number().nullable().describe('Score on the question, from 0 to 100.'),
      number_attempts: z
        .number()
        .describe(
          'Counter kept by some grading paths; can be 0 when submissions exist. Count rows in submissions instead.',
        ),
      highest_submission_score: z
        .number()
        .nullable()
        .describe('Best submission score, from 0 to 1.'),
      requires_manual_grading: z.boolean().describe('Whether manual grading is pending.'),
      duration: z.number().nullable().describe('Time spent on the question, in seconds.'),
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
      broken: z.boolean().describe('Whether the variant was marked broken.'),
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
      mode: EnumModeSchema.nullable().describe('Server mode the answer was submitted in.'),
      gradable: z
        .boolean()
        .nullable()
        .describe('Whether the answer could be graded. False when it had format errors.'),
      broken: z.boolean().nullable().describe('Whether grading hit an error.'),
      graded_at: TimestampSchema.nullable().describe(
        'When the submission was graded. Null if not graded.',
      ),
      score: z
        .number()
        .nullable()
        .describe('Score from 0 to 1, after any manual override. Null if not graded.'),
      correct: z.boolean().nullable().describe('Whether the submission was fully correct.'),
      overridden: z.boolean().describe('Whether staff manually overrode the score.'),
      credit: z
        .number()
        .nullable()
        .describe("Credit percentage from the assessment's access rules at submission time."),
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
