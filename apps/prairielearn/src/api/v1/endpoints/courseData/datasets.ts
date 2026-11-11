import { z } from 'zod';

import { CourseDataQuerySchema, courseDataQuerySchema } from '@prairielearn/course-agent-types';
import { loadSqlEquiv } from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import {
  EnumAssessmentTypeSchema,
  EnumGradingMethodSchema,
  EnumInstanceQuestionStatusSchema,
  EnumModeSchema,
} from '../../../../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);

// Rows are JSON: IDs are strings, as in the rest of the API, and timestamps are ISO 8601 in UTC.
const TimestampSchema = z.iso.datetime();

function dataset<Shape extends Record<string, z.ZodType>>({
  description,
  query,
  schema,
}: {
  description: string;
  query: string;
  schema: z.ZodObject<Shape>;
}) {
  return {
    description,
    query,
    schema,
    querySchema: courseDataQuerySchema(z.enum(Object.keys(schema.shape) as [keyof Shape & string])),
  };
}

/**
 * The course data API's datasets: the single source of truth for what the API exposes. The router,
 * the request schemas, and the committed JSON Schema are derived from this registry, and a test
 * checks that each query returns exactly its schema's columns. Within v1, only add datasets and
 * columns; a removal, rename, or change in meaning needs a new version.
 */
export const COURSE_DATA_DATASETS = {
  course_instances: dataset({
    description: 'Offerings of the course, each with its own students and assessments.',
    query: sql.select_course_instances_by_course_id,
    schema: z.object({
      id: IdSchema,
      short_name: z.string().describe('Directory name under courseInstances/.'),
      long_name: z.string().nullable().describe('Display name.'),
      display_timezone: z
        .string()
        .describe('IANA timezone name used to display dates in this course instance.'),
      publishing_start_date: TimestampSchema.nullable().describe(
        'When students can first access the course instance.',
      ),
      publishing_end_date: TimestampSchema.nullable().describe('When student access ends.'),
    }),
  }),
  assessments: dataset({
    description: 'Assessments in each course instance.',
    query: sql.select_assessments_by_course_id,
    schema: z.object({
      id: IdSchema,
      course_instance_id: IdSchema,
      tid: z
        .string()
        .nullable()
        .describe("Directory name under the course instance's assessments/."),
      title: z.string().nullable().describe('Title shown to students.'),
      label: z
        .string()
        .describe('Short label shown to students: the assessment set abbreviation and number.'),
      set_name: z.string().nullable().describe('Name of the assessment set.'),
      number: z.string().describe('Number within the assessment set.'),
      type: EnumAssessmentTypeSchema.describe('Assessment type.'),
      max_points: z.number().nullable().describe('Points needed for a score of 100%.'),
      max_bonus_points: z.number().nullable().describe('Points available beyond 100%.'),
      multiple_instance: z.boolean().describe('Whether a student can start more than one attempt.'),
      team_work: z.boolean().describe('Whether students work in teams.'),
    }),
  }),
  questions: dataset({
    description: 'Questions in the course question bank.',
    query: sql.select_questions_by_course_id,
    schema: z.object({
      id: IdSchema,
      qid: z.string().nullable().describe('Directory path under questions/.'),
      title: z.string().nullable().describe('Question title.'),
      topic: z.string().nullable().describe('Topic name.'),
      grading_method: EnumGradingMethodSchema.describe('How submissions are graded.'),
      single_variant: z
        .boolean()
        .nullable()
        .describe('Whether every student sees the same variant.'),
      draft: z.boolean().describe('Whether the question is a draft.'),
    }),
  }),
  assessment_questions: dataset({
    description:
      'Questions as placed on an assessment, with their points and statistics. Statistics are precomputed and can be out of date.',
    query: sql.select_assessment_questions_by_course_id,
    schema: z.object({
      id: IdSchema,
      course_instance_id: IdSchema,
      assessment_id: IdSchema,
      question_id: IdSchema,
      number: z.number().nullable().describe('Position on the assessment.'),
      max_points: z.number().nullable().describe('Points available for this question.'),
      max_auto_points: z.number().nullable().describe('Points available from automatic grading.'),
      max_manual_points: z.number().nullable().describe('Points available from manual grading.'),
      mean_question_score: z
        .number()
        .nullable()
        .describe('Mean score across students, from 0 to 100.'),
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
      assessment_id: IdSchema,
      user_id: IdSchema.nullable().describe('Null for team work.'),
      team_id: IdSchema.nullable().describe('Null for individual work.'),
      number: z.number().describe('Attempt number for this student and assessment, from 1.'),
      mode: EnumModeSchema.nullable().describe('Access mode when the attempt started.'),
      open: z.boolean().describe('Whether the attempt is still open.'),
      started_at: TimestampSchema.nullable().describe('When the attempt started.'),
      closed_at: TimestampSchema.nullable().describe('When the attempt closed.'),
      duration: z.number().nullable().describe('Time spent on the attempt, in seconds.'),
      points: z.number().nullable().describe('Points earned.'),
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
      assessment_id: IdSchema,
      assessment_instance_id: IdSchema,
      assessment_question_id: IdSchema,
      question_id: IdSchema,
      number: z.number().nullable().describe('Position in the attempt.'),
      status: EnumInstanceQuestionStatusSchema.nullable().describe('Grading status.'),
      points: z.number().nullable().describe('Points from automatic and manual grading.'),
      auto_points: z.number().nullable().describe('Points from automatic grading.'),
      manual_points: z.number().nullable().describe('Points from manual grading.'),
      score_perc: z.number().nullable().describe('Score from 0 to 100.'),
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
      assessment_id: IdSchema,
      instance_question_id: IdSchema,
      question_id: IdSchema,
      user_id: IdSchema.nullable().describe('Null for team work.'),
      team_id: IdSchema.nullable().describe('Null for individual work.'),
      number: z.number().nullable().describe('Variant number within the instance question.'),
      created_at: TimestampSchema.nullable().describe('When the variant was generated.'),
      open: z.boolean().nullable().describe('Whether more submissions are accepted.'),
      broken: z.boolean().describe('Whether the variant was marked broken.'),
    }),
  }),
  submissions: dataset({
    description:
      'Student answer submissions, without answer contents. Instructor previews are excluded.',
    query: sql.select_submissions_by_course_id,
    schema: z.object({
      id: IdSchema,
      course_instance_id: IdSchema,
      assessment_id: IdSchema,
      assessment_instance_id: IdSchema,
      instance_question_id: IdSchema,
      question_id: IdSchema,
      variant_id: IdSchema,
      user_id: IdSchema.nullable().describe('Null for team work.'),
      team_id: IdSchema.nullable().describe('Null for individual work.'),
      submitted_at: TimestampSchema.nullable().describe('When the answer was submitted.'),
      mode: EnumModeSchema.nullable().describe('Access mode when the answer was submitted.'),
      gradable: z.boolean().nullable().describe('False when the answer had format errors.'),
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
      credit: z.number().nullable().describe('Credit percentage applied at submission time.'),
    }),
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

/** The dataset list endpoint's response, also committed as JSON Schema for review. */
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
