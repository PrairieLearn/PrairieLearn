import { z } from 'zod';

import { CourseDataQuerySchema, courseDataQuerySchema } from '@prairielearn/course-agent-types';
import { loadSqlEquiv } from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import {
  EnumAiGradingProviderSchema,
  EnumAssessmentTypeSchema,
  EnumCourseInstanceRoleSchema,
  EnumCourseRoleSchema,
  EnumEnrollmentStatusSchema,
  EnumGradingMethodSchema,
  EnumInstanceQuestionStatusSchema,
  EnumModeSchema,
  EnumRubricItemShowToStudentsSchema,
  GradingJobSchema,
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
  label,
  icon,
  description,
  query,
  schema,
  largeColumns = [],
}: {
  /** What the rows are, as a plural an instructor would use, such as `attempts`. */
  label: string;
  /** A Bootstrap icon for the dataset, without the `bi-` prefix. */
  icon: string;
  description: string;
  query: string;
  schema: z.ZodObject<Shape>;
  /** Columns whose values can be large, so rows that include them are read a few at a time. */
  largeColumns?: (keyof Shape & string)[];
}) {
  return {
    label,
    icon,
    description,
    query,
    schema,
    largeColumns: new Set<string>(largeColumns),
    querySchema: courseDataQuerySchema(z.enum(Object.keys(schema.shape) as [keyof Shape & string])),
  };
}

// Who owns an attempt, for datasets with one row per event in an attempt.
const ATTEMPT_OWNER = {
  user_id: IdSchema.nullable().describe('Student who owns the attempt. Null for team work.'),
  team_id: IdSchema.nullable().describe('Team that owns the attempt. Null for individual work.'),
};

// Who caused a recorded change.
const CHANGED_BY = {
  changed_by_user_id: IdSchema.nullable().describe(
    'User whose action caused the change: the student when their own answers were graded, or a staff member (as user_id in staff). Null when none was recorded.',
  ),
};

/**
 * The course data datasets: the single source of truth for what the course agent can read. The
 * router and the request schemas are derived from this registry, and a test checks that each query
 * returns exactly its schema's columns. Within v1, only add datasets and columns; a removal,
 * rename, or change in meaning needs a new version, since a running conversation may still use
 * an older Worker.
 *
 * No dataset returns a column that identifies a person, such as a name, UID, email, or UIN, so
 * identities never leave the database. People appear only as IDs, which join rows across datasets.
 */
export const COURSE_DATA_DATASETS = {
  course_instances: dataset({
    label: 'course instances',
    icon: 'easel',
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
    label: 'assessments',
    icon: 'list-check',
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
    label: 'questions',
    icon: 'question-circle',
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
    label: 'questions on assessments',
    icon: 'list-ol',
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
    label: 'attempts',
    icon: 'clipboard-check',
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
    label: 'question scores',
    icon: 'clipboard-data',
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
      assigned_grader_user_id: IdSchema.nullable().describe(
        'Staff member assigned to grade the question manually, as user_id in staff. Null if none.',
      ),
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
    label: 'question versions',
    icon: 'shuffle',
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
    label: 'submissions',
    icon: 'file-earmark-text',
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
  issues: dataset({
    label: 'issues',
    icon: 'bug',
    description:
      "Problems reported on the course's questions, by students or by PrairieLearn when a question's code fails.",
    query: sql.select_issues_by_course_id,
    schema: z.object({
      id: IdSchema,
      course_instance_id: IdSchema.nullable().describe(
        'Course instance the issue was reported in. Null when reported from a question preview.',
      ),
      course_instance_short_name: CourseInstanceShortNameSchema.nullable(),
      assessment_id: IdSchema.nullable().describe(
        'Assessment the issue was reported in. Null when reported outside an assessment.',
      ),
      assessment_tid: AssessmentTidSchema,
      question_id: IdSchema.nullable(),
      qid: QidSchema,
      instance_question_id: IdSchema.nullable(),
      variant_id: IdSchema.nullable().describe(
        'Version of the question the reporter was looking at, as in the variants dataset when a student reported it.',
      ),
      user_id: IdSchema.nullable().describe('User who was working on the question.'),
      reported_at: TimestampSchema.nullable().describe('When the issue was reported.'),
      open: z.boolean().describe('Whether the issue still waits for staff to resolve it.'),
      manually_reported: z
        .boolean()
        .describe(
          "True when a person reported it with the question's report button. False when PrairieLearn reported it because the question's code failed.",
        ),
      student_message: z
        .string()
        .nullable()
        .describe("The reporter's description, or a short description of the failure."),
      instructor_message: z
        .string()
        .nullable()
        .describe("Detail for staff, such as the error the question's code raised."),
    }),
  }),
  sharing_sets: dataset({
    label: 'sharing sets',
    icon: 'share',
    description:
      "The course's sharing sets, which group questions to share with other courses. They are defined in infoCourse.json, and a question joins one in its info.json.",
    query: sql.select_sharing_sets_by_course_id,
    schema: z.object({
      id: IdSchema,
      name: z.string().describe('Name of the sharing set, as in infoCourse.json.'),
      description: z.string().nullable().describe('What the sharing set is for.'),
    }),
  }),
  sharing_set_courses: dataset({
    label: 'courses with access to sharing sets',
    icon: 'building',
    description: "Other courses that can use the questions in one of this course's sharing sets.",
    query: sql.select_sharing_set_courses_by_course_id,
    schema: z.object({
      sharing_set_id: IdSchema,
      sharing_set_name: z.string().describe('Name of the sharing set.'),
      course_short_name: z
        .string()
        .nullable()
        .describe('Short name of the course that has access, such as CS 101.'),
      course_title: z.string().nullable().describe('Title of the course that has access.'),
    }),
  }),
  students: dataset({
    label: 'students',
    icon: 'people',
    description:
      'People enrolled in or invited to each course instance. Course staff are not listed. Students are identified only by enrollment_id and user_id; their names, UIDs, and emails are not available.',
    query: sql.select_students_by_course_id,
    schema: z.object({
      enrollment_id: IdSchema,
      course_instance_id: IdSchema,
      course_instance_short_name: CourseInstanceShortNameSchema,
      user_id: IdSchema.nullable().describe(
        'The user, as user_id in other datasets. Null for an invitation not yet accepted.',
      ),
      status: EnumEnrollmentStatusSchema.describe(
        'invited: invited but not yet joined. joined: enrolled. rejected: declined the invitation. left: left on their own. removed: removed by staff. blocked: blocked by staff.',
      ),
      first_joined_at: TimestampSchema.nullable().describe('When the student first joined.'),
    }),
  }),
  student_label_members: dataset({
    label: 'student labels',
    icon: 'tags',
    description:
      'Which students are in which student labels. Labels are defined in "studentLabels" in infoCourseInstance.json.',
    query: sql.select_student_label_members_by_course_id,
    schema: z.object({
      course_instance_id: IdSchema,
      course_instance_short_name: CourseInstanceShortNameSchema,
      label_name: z.string().describe('Name of the label.'),
      enrollment_id: IdSchema.describe('The student, as enrollment_id in students.'),
      user_id: IdSchema.nullable().describe(
        'The student, as user_id in other datasets. Null for an invitation not yet accepted.',
      ),
    }),
  }),
  publishing_extension_students: dataset({
    label: 'publishing extensions',
    icon: 'calendar-plus',
    description:
      'Students with extended access to a course instance after it closes for everyone else, one row per student per extension.',
    query: sql.select_publishing_extension_students_by_course_id,
    schema: z.object({
      course_instance_id: IdSchema,
      course_instance_short_name: CourseInstanceShortNameSchema,
      extension_name: z.string().nullable().describe('Name of the extension.'),
      end_date: TimestampSchema.describe("When the extension's access ends."),
      enrollment_id: IdSchema.describe('The student, as enrollment_id in students.'),
      user_id: IdSchema.nullable().describe(
        'The student, as user_id in other datasets. Null for an invitation not yet accepted.',
      ),
    }),
  }),
  group_members: dataset({
    label: 'group members',
    icon: 'diagram-3',
    description:
      'Which students are in which group, for assessments that use group work. One row per student per group.',
    query: sql.select_group_members_by_course_id,
    schema: z.object({
      course_instance_id: IdSchema,
      course_instance_short_name: CourseInstanceShortNameSchema,
      assessment_id: IdSchema,
      assessment_tid: AssessmentTidSchema,
      team_id: IdSchema.describe('The group, as team_id in assessment_instances.'),
      group_name: z.string().describe('Name of the group, unique in the assessment.'),
      user_id: IdSchema.describe('The student, as user_id in other datasets.'),
    }),
  }),
  staff: dataset({
    label: 'staff',
    icon: 'person-badge',
    description:
      "People on the course's staff and their course roles. Staff are identified only by user_id; their names, UIDs, and emails are not available.",
    query: sql.select_staff_by_course_id,
    schema: z.object({
      user_id: IdSchema,
      course_role: EnumCourseRoleSchema.describe(
        'Previewer, Viewer, Editor, or Owner, each with the access of the one before and more. None means the person only has access to student data in some course instances.',
      ),
    }),
  }),
  attempt_score_changes: dataset({
    label: 'attempt score changes',
    icon: 'clock-history',
    description:
      "Each change to an attempt's total score, from grading or from staff setting it. The latest change for an attempt is its current total, as in assessment_instances.",
    query: sql.select_attempt_score_changes_by_course_id,
    schema: z.object({
      id: IdSchema,
      course_instance_id: IdSchema,
      course_instance_short_name: CourseInstanceShortNameSchema,
      assessment_id: IdSchema,
      assessment_tid: AssessmentTidSchema,
      assessment_instance_id: IdSchema,
      ...ATTEMPT_OWNER,
      changed_at: TimestampSchema.nullable().describe('When the total changed.'),
      ...CHANGED_BY,
      points: z.number().nullable().describe('Points on the attempt after the change.'),
      max_points: z.number().nullable().describe('Points needed for a score of 100%.'),
      score_perc: z
        .number()
        .nullable()
        .describe('Score from 0 to 100 after the change, which bonus points can exceed.'),
    }),
  }),
  question_score_changes: dataset({
    label: 'question score changes',
    icon: 'clock-history',
    description:
      "Each change to a question's score in an attempt, from grading or from staff setting it. The latest change for a question is its current score, as in instance_questions.",
    query: sql.select_question_score_changes_by_course_id,
    schema: z.object({
      id: IdSchema,
      course_instance_id: IdSchema,
      course_instance_short_name: CourseInstanceShortNameSchema,
      assessment_id: IdSchema,
      assessment_tid: AssessmentTidSchema,
      assessment_instance_id: IdSchema,
      ...ATTEMPT_OWNER,
      instance_question_id: IdSchema,
      question_id: IdSchema,
      qid: QidSchema,
      changed_at: TimestampSchema.nullable().describe('When the score changed.'),
      ...CHANGED_BY,
      grading_job_id: IdSchema.nullable().describe(
        'The grading that caused the change, as in grading_jobs. Null when staff set the score directly.',
      ),
      points: z.number().nullable().describe('Points on the question after the change.'),
      auto_points: z
        .number()
        .nullable()
        .describe('Points from automatic grading after the change.'),
      manual_points: z.number().nullable().describe('Points from manual grading after the change.'),
      max_points: z.number().nullable(),
      max_auto_points: z.number().nullable(),
      max_manual_points: z.number().nullable(),
      score_perc: z.number().nullable().describe('Score from 0 to 100 after the change.'),
    }),
  }),
  attempt_state_changes: dataset({
    label: 'attempt history',
    icon: 'clock-history',
    description:
      'Each time an attempt opened, closed, or had its time limit changed, whether by the student, by staff, or by the time running out.',
    query: sql.select_attempt_state_changes_by_course_id,
    schema: z.object({
      id: IdSchema,
      course_instance_id: IdSchema,
      course_instance_short_name: CourseInstanceShortNameSchema,
      assessment_id: IdSchema,
      assessment_tid: AssessmentTidSchema,
      assessment_instance_id: IdSchema,
      ...ATTEMPT_OWNER,
      changed_at: TimestampSchema.nullable().describe('When it changed.'),
      ...CHANGED_BY,
      open: z
        .boolean()
        .nullable()
        .describe('Whether the attempt accepted answers after the change.'),
      time_limit_ends_at: TimestampSchema.nullable().describe(
        "When the attempt's time runs out after the change. Null for no time limit.",
      ),
    }),
  }),
  grading_jobs: dataset({
    label: 'grading history',
    icon: 'check2-square',
    description:
      'Each grading of a submission: by the question, by an external grader, by staff, or by AI grading. A submission can be graded more than once, and its latest grading sets its score.',
    query: sql.select_grading_jobs_by_course_id,
    schema: z.object({
      id: IdSchema,
      course_instance_id: IdSchema,
      course_instance_short_name: CourseInstanceShortNameSchema,
      assessment_id: IdSchema,
      assessment_tid: AssessmentTidSchema,
      assessment_instance_id: IdSchema,
      ...ATTEMPT_OWNER,
      instance_question_id: IdSchema,
      question_id: IdSchema,
      qid: QidSchema,
      variant_id: IdSchema,
      submission_id: IdSchema,
      grading_method: GradingJobSchema.shape.grading_method.describe(
        "Internal: the question's own code graded it. External: an external grader ran the submitted code. Manual: staff graded it. AI: AI grading graded it.",
      ),
      requested_at: TimestampSchema.nullable().describe('When grading was requested.'),
      graded_at: TimestampSchema.nullable().describe('When grading finished. Null while waiting.'),
      graded_by_user_id: IdSchema.nullable().describe(
        'Staff member who graded it, or who started AI grading, as user_id in staff. Null for grading by the question or an external grader.',
      ),
      gradable: z
        .boolean()
        .nullable()
        .describe('False when the submission could not be graded, such as invalid input.'),
      correct: z.boolean().nullable(),
      score: z.number().nullable().describe('Score from 0 to 1.'),
      auto_points: z.number().nullable(),
      manual_points: z.number().nullable(),
      feedback: JsonObjectSchema.nullable().describe(
        'Feedback shown to the student, such as a "manual" comment from staff or AI grading. Its other keys depend on the grader.',
      ),
    }),
    largeColumns: ['feedback'],
  }),
  ai_grading_jobs: dataset({
    label: 'AI grading history',
    icon: 'stars',
    description:
      'Details of each AI grading, one per grading in grading_jobs whose grading_method is AI. The score and feedback it gave are in grading_jobs.',
    query: sql.select_ai_grading_jobs_by_course_id,
    schema: z.object({
      id: IdSchema,
      grading_job_id: IdSchema,
      course_instance_id: IdSchema,
      course_instance_short_name: CourseInstanceShortNameSchema,
      assessment_id: IdSchema,
      assessment_tid: AssessmentTidSchema,
      assessment_instance_id: IdSchema,
      ...ATTEMPT_OWNER,
      instance_question_id: IdSchema,
      question_id: IdSchema,
      qid: QidSchema,
      submission_id: IdSchema,
      graded_at: TimestampSchema.nullable().describe('When AI grading finished.'),
      provider: EnumAiGradingProviderSchema.nullable().describe('Company whose model graded it.'),
      model: z.string().describe('Model that graded it.'),
      prompt_tokens: z.number().describe('Size of what the model was sent, in tokens.'),
      completion_tokens: z.number().describe('Size of its reply, in tokens.'),
    }),
  }),
  rubrics: dataset({
    label: 'rubrics',
    icon: 'card-checklist',
    description:
      "Manual grading rubrics, one per assessment question that has one. Items are in rubric_items. Rubrics are edited on the question's manual grading page, not in course files.",
    query: sql.select_rubrics_by_course_id,
    schema: z.object({
      id: IdSchema,
      course_instance_id: IdSchema,
      course_instance_short_name: CourseInstanceShortNameSchema,
      assessment_id: IdSchema,
      assessment_tid: AssessmentTidSchema,
      assessment_question_id: IdSchema,
      question_id: IdSchema,
      qid: QidSchema,
      replace_auto_points: z
        .boolean()
        .describe(
          'True when the rubric grades the whole question, replacing automatic points. False when it grades only the manual part.',
        ),
      starting_points: z
        .number()
        .describe(
          'Points before any item applies: 0 when items add points, or the maximum when items take points off.',
        ),
      min_points: z.number().describe('The fewest points items can bring the score to.'),
      max_extra_points: z
        .number()
        .describe('How far items can take the score above the maximum, as bonus points.'),
      grader_guidelines: z.string().nullable().describe('Instructions for graders.'),
      modified_at: TimestampSchema.describe('When the rubric was last changed.'),
    }),
  }),
  rubric_items: dataset({
    label: 'rubric items',
    icon: 'card-list',
    description: 'Items of the rubrics in the rubrics dataset, in the order graders see them.',
    query: sql.select_rubric_items_by_course_id,
    schema: z.object({
      id: IdSchema,
      rubric_id: IdSchema,
      course_instance_id: IdSchema,
      course_instance_short_name: CourseInstanceShortNameSchema,
      assessment_id: IdSchema,
      assessment_tid: AssessmentTidSchema,
      assessment_question_id: IdSchema,
      qid: QidSchema,
      number: z.number().describe('Position in the rubric, from 0.'),
      description: z
        .string()
        .describe("The item's short text, which can use the question's Mustache parameters."),
      points: z.number().describe('Points the item adds, or takes off when negative.'),
      explanation: z.string().nullable().describe('Longer explanation shown with the item.'),
      grader_note: z.string().nullable().describe('Note for graders only.'),
      show_to_students: EnumRubricItemShowToStudentsSchema.describe(
        'always: students see the item whether or not it applied. when_selected: only when it applied. never: students never see it.',
      ),
    }),
  }),
  staff_student_data_access: dataset({
    label: 'staff access to student data',
    icon: 'shield-lock',
    description:
      'Staff who can see or edit student data in each course instance. A course role, even Owner, gives no access to student data on its own. Grading, changing scores, and managing students need Student Data Editor.',
    query: sql.select_staff_student_data_access_by_course_id,
    schema: z.object({
      user_id: IdSchema.describe('The staff member, as user_id in staff.'),
      course_instance_id: IdSchema,
      course_instance_short_name: CourseInstanceShortNameSchema,
      access: EnumCourseInstanceRoleSchema.exclude(['None']).describe(
        'Student Data Viewer: can see students and their work. Student Data Editor: can also change them.',
      ),
    }),
  }),
  sharing_set_questions: dataset({
    label: 'questions in sharing sets',
    icon: 'collection',
    description:
      "Which of the course's questions are in which sharing set. A question joins a sharing set in its info.json.",
    query: sql.select_sharing_set_questions_by_course_id,
    schema: z.object({
      sharing_set_id: IdSchema,
      sharing_set_name: z.string().describe('Name of the sharing set.'),
      question_id: IdSchema,
      qid: QidSchema,
    }),
  }),
  shared_question_usages: dataset({
    label: 'uses of shared questions',
    icon: 'box-arrow-up-right',
    description:
      "Assessments in other courses that use this course's shared questions, one row per question per assessment.",
    query: sql.select_shared_question_usages_by_course_id,
    schema: z.object({
      question_id: IdSchema,
      qid: QidSchema,
      course_short_name: z
        .string()
        .nullable()
        .describe('Short name of the course that uses the question, such as CS 101.'),
      course_title: z.string().nullable().describe('Title of that course.'),
      course_instance_short_name: z
        .string()
        .nullable()
        .describe("The course instance's directory name in that course."),
      assessment_tid: z.string().nullable().describe("The assessment's directory in that course."),
      assessment_title: z.string().nullable().describe("The assessment's title in that course."),
    }),
  }),
};

type CourseDatasetName = keyof typeof COURSE_DATA_DATASETS;

export function isCourseDataset(name: string): name is CourseDatasetName {
  return Object.hasOwn(COURSE_DATA_DATASETS, name);
}

const COURSE_DATA_VERSION = 1;

/**
 * Plain names for columns an instructor would not recognize, used when a request to read course
 * data is shown to them. A column without one is shown by its own name. A name applies in every
 * dataset, so only list a column that means the same thing wherever it appears.
 */
const COLUMN_LABELS: Record<string, string> = {
  course_instance_short_name: 'course instance',
  assessment_tid: 'assessment',
  qid: 'question',
};

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
    column_labels: COLUMN_LABELS,
    datasets: Object.fromEntries(
      Object.entries(COURSE_DATA_DATASETS).map(([name, dataset]) => [
        name,
        {
          label: dataset.label,
          icon: dataset.icon,
          description: dataset.description,
          schema: toJsonSchema(dataset.schema),
        },
      ]),
    ),
  };
}
