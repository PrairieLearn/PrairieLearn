import { z } from 'zod';

import { CommentSchema } from './comment.js';

const GroupRoleSchema = z
  .object({
    name: z.string().describe("The group role's name (i.e. Manager, Reflector, Recorder)."),
    minimum: z
      .number()
      .describe('The minimum number of users that should be in this role in a group.')
      .optional(),
    maximum: z
      .number()
      .describe('The maximum number of users that should be in this role in a group.')
      .optional(),
    canAssignRoles: z
      .boolean()
      .describe("Whether users with this role can assign other users' group roles.")
      .optional(),
  })
  .describe(
    'A custom role for use in group assessments that allows control over certain permissions.',
  );

export const AsssessmentAccessRuleSchema = z
  .object({
    comment: CommentSchema.optional(),
    mode: z.enum(['Public', 'Exam']).describe('The server mode required for access.').optional(),
    examUuid: z
      .string()
      .regex(
        new RegExp('^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'),
      )
      .describe(
        'The PrairieTest exam UUID for which a student must be registered. Implies mode: Exam.',
      )
      .optional(),
    role: z.enum(['Student', 'TA', 'Instructor']).describe('DEPRECATED -- do not use.').optional(),
    uids: z
      .array(z.string())
      .describe("A list of UIDs (like 'username@example.com', one of which is required for access")
      .optional(),
    credit: z
      .number()
      .int()
      .gte(0)
      .describe(
        'How much credit is awarded for doing the homework, as a percentage (100 means full credit).',
      )
      .optional(),
    startDate: z.string().describe('The earliest date on which access is permitted.').optional(),
    endDate: z.string().describe('The latest date on which access is permitted.').optional(),
    timeLimitMin: z
      .number()
      .int()
      .gte(0)
      .describe('The time limit to complete the assessment, in minutes (only for Exams).')
      .optional(),
    password: z.string().describe('Password to begin the assessment (only for Exams).').optional(),
    showClosedAssessment: z
      .boolean()
      .describe('Whether the student can view the assessment after it has been closed')
      .optional(),
    showClosedAssessmentScore: z
      .boolean()
      .describe(
        'Whether the student can view the assessment grade after it has been closed. Only works if showClosedAssessment is also set to false',
      )
      .optional(),
    active: z
      .boolean()
      .describe(
        'Whether the student can create a new assessment instance and submit answers to questions. If set to false, the available credit must be 0.',
      )
      .optional(),
  })
  .strict()
  .describe(
    'An access rule that permits people to access this assessment. All restrictions in the rule must be satisfied for the rule to allow access.',
  );

export type AsssessmentAccessRule = z.infer<typeof AsssessmentAccessRuleSchema>;

export const PointsSingleSchema = z.number().gte(0).describe('A single point value.');

export const PointsListSchema = z
  .array(PointsSingleSchema)
  .min(1)
  .describe('An array of point values.');

export const PointsSchema = z.union([PointsSingleSchema, PointsListSchema]);

export const QuestionIdSchema = z
  .string()
  .describe('Question ID (directory name of the question).');

export const ForceMaxPointsSchema = z
  .boolean()
  .describe('Whether to force this question to be awarded maximum points on a regrade.');

export const AdvanceScorePercSchema = z
  .number()
  .gte(0)
  .lte(100)
  .describe('Minimum score percentage to unlock access to subsequent questions');

const QuestionPointsSchema = z.object({
  points: PointsSchema.optional(),
  autoPoints: PointsSchema.optional(),
  maxPoints: PointsSingleSchema.optional(),
  maxAutoPoints: PointsSingleSchema.optional(),
  manualPoints: PointsSingleSchema.optional(),
});

export type QuestionPoints = z.infer<typeof QuestionPointsSchema>;

const QuestionAlternativeSchema = QuestionPointsSchema.extend({
  comment: CommentSchema.optional(),
  id: QuestionIdSchema,
  forceMaxPoints: ForceMaxPointsSchema.optional(),
  triesPerVariant: z
    .number()
    .describe('The maximum number of graded submissions allowed for each question instance.')
    .optional(),
  advanceScorePerc: AdvanceScorePercSchema.optional(),
  gradeRateMinutes: z
    .number()
    .gte(0)
    .describe(
      'Minimum amount of time (in minutes) between graded submissions to the same question.',
    )
    .optional(),
  canView: z.set(z.string()).describe('The names of roles that can view this question.').optional(),
  canSubmit: z
    .set(z.string())
    .describe('The names of roles that can submit this question.')
    .optional(),
});

const ZoneQuestionSchema = QuestionPointsSchema.extend({
  comment: CommentSchema.optional(),
  points: PointsSchema.optional(),
  autoPoints: PointsSchema.optional(),
  maxPoints: PointsSingleSchema.optional(),
  maxAutoPoints: PointsSingleSchema.optional(),
  manualPoints: PointsSingleSchema.optional(),
  id: QuestionIdSchema.optional(),
  forceMaxPoints: ForceMaxPointsSchema.optional(),
  alternatives: z
    .array(QuestionAlternativeSchema)
    .min(1)
    .describe('Array of question alternatives to choose from.')
    .optional(),
  numberChoose: z
    .number()
    .int()
    .gte(0)
    .describe('Number of questions to choose from this group.')
    .optional(),
  triesPerVariant: z
    .number()
    .describe('The maximum number of graded submissions allowed for each question instance.')
    .optional(),
  advanceScorePerc: AdvanceScorePercSchema.optional(),
  singleVariant: z
    .boolean()
    .describe(
      'Whether the question is not randomized and only generates a single variant (defaults to "false").',
    )
    .optional(),
  gradeRateMinutes: z
    .number()
    .gte(0)
    .describe(
      'Minimum amount of time (in minutes) between graded submissions to the same question.',
    )
    .optional(),
  canSubmit: z
    .set(z.string())
    .describe(
      'A list of group role names matching those in groupRoles that can submit the question. Only applicable for group assessments.',
    )
    .optional(),
  canView: z
    .set(z.string())
    .describe(
      'A list of group role names matching those in groupRoles that can view the question. Only applicable for group assessments.',
    )
    .optional(),
});

const ZoneSchema = z.object({
  title: z
    .string()
    .describe('Zone title, displayed to the students at the top of the question list for the zone.')
    .optional(),
  comment: CommentSchema.optional(),
  // Do we need to allow for additional keys?
  comments: CommentSchema.optional().describe('DEPRECATED -- do not use.'),
  maxPoints: z
    .number()
    .describe(
      'Only this many of the points that are awarded for answering questions in this zone will count toward the total points.',
    )
    .optional(),
  numberChoose: z
    .number()
    .int()
    .gte(0)
    .describe('Number of questions to choose from this zone.')
    .optional(),
  bestQuestions: z
    .number()
    .int()
    .gte(0)
    .describe(
      'Only this many of the questions in this zone, with the highest number of awarded points, will count toward the total points.',
    )
    .optional(),
  questions: z.array(ZoneQuestionSchema).min(1).describe('Array of questions in the zone.'),
  advanceScorePerc: AdvanceScorePercSchema.optional(),
  gradeRateMinutes: z
    .number()
    .gte(0)
    .describe(
      'Minimum amount of time (in minutes) between graded submissions to the same question.',
    )
    .optional(),
  canSubmit: z
    .set(z.string())
    .describe(
      'A list of group role names that can submit questions in this zone. Only applicable for group assessments.',
    )
    .optional(),
  canView: z
    .set(z.string())
    .describe(
      'A list of group role names that can view questions in this zone. Only applicable for group assessments.',
    )
    .optional(),
});

export const AssessmentSchema = z
  .object({
    comment: CommentSchema.optional(),
    uuid: z
      .string()
      .regex(
        new RegExp('^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'),
      )
      .describe('Unique identifier (UUID v4).'),
    type: z.enum(['Homework', 'Exam']).describe('Type of the assessment.'),
    title: z
      .string()
      .describe("The title of the assessment (e.g., 'Derivatives and anti-derivatives')."),
    set: z
      .string()
      .describe("Which assessmentSet this one belongs to (e.g., 'Homework', 'Practice Quiz')."),
    number: z
      .string()
      .describe("The number of this assessment within the set (e.g., '1', '2R', '3B')."),
    allowIssueReporting: z
      .boolean()
      .describe('Whether to allow students to report issues for assessment questions')
      .optional(),
    multipleInstance: z
      .boolean()
      .describe('Whether to allow students to create additional instances of the assessment')
      .optional(),
    shuffleQuestions: z
      .boolean()
      .describe('Whether the questions will be shuffled in the student view of an assessment')
      .optional(),
    allowAccess: z
      .array(AsssessmentAccessRuleSchema)
      .describe(
        'List of access rules for the assessment. Access is permitted if any access rule is satisfied.',
      )
      .optional(),
    text: z.string().describe('HTML text shown on the assessment overview page.').optional(),
    maxPoints: z
      .number()
      .describe(
        'The number of points that must be earned in this assessment to achieve a score of 100%.',
      )
      .optional(),
    maxBonusPoints: z
      .number()
      .describe('The maximum number of additional points that can be earned beyond maxPoints.')
      .optional(),
    allowPersonalNotes: z
      .boolean()
      .describe('Whether students are allowed to upload personal notes for this assessment.')
      .optional(),
    autoClose: z
      .boolean()
      .describe('Whether to automatically close the assessment after a period of inactivity.')
      .optional(),
    zones: z
      .array(ZoneSchema)
      .describe(
        'Array of "zones" in the assessment, each containing questions that can be randomized within the zone.',
      )
      .optional(),
    constantQuestionValue: z
      .boolean()
      .describe(
        'Whether to keep the value of a question constant after a student solves it correctly.',
      )
      .optional(),
    allowRealTimeGrading: z
      .boolean()
      .describe(
        'Removes the student "Grade" buttons to prevent real-time grading while the assessment is being taken.',
      )
      .optional(),
    requireHonorCode: z
      .boolean()
      .describe('Requires the student to accept an honor code before starting exam assessments.')
      .optional(),
    groupWork: z.boolean().describe('Whether the assessment will support group work.').optional(),
    groupMaxSize: z.number().describe('Maximum number of students in a group.').optional(),
    groupMinSize: z.number().describe('Minimum number of students in a group.').optional(),
    groupRoles: z
      .array(GroupRoleSchema)
      .describe('Array of custom user roles in a group.')
      .optional(),
    canSubmit: z
      .set(z.string())
      .describe(
        'A list of group role names that can submit questions in this assessment. Only applicable for group assessments.',
      )
      .optional(),
    canView: z
      .set(z.string())
      .describe(
        'A list of group role names that can view questions in this assessment. Only applicable for group assessments.',
      )
      .optional(),
    studentGroupCreate: z.boolean().describe('Whether students can create groups.').optional(),
    studentGroupJoin: z.boolean().describe('Whether students can join groups.').optional(),
    studentGroupLeave: z.boolean().describe('Whether students can leave groups.').optional(),
    advanceScorePerc: AdvanceScorePercSchema.optional(),
    gradeRateMinutes: z
      .number()
      .gte(0)
      .describe(
        'Minimum amount of time (in minutes) between graded submissions to the same question.',
      )
      .optional(),
    module: z
      .string()
      .describe('Module that this assessment belongs to, as defined in infoCourse.json.')
      .optional(),
  })
  .strict()
  .describe('Configuration data for an assessment.');

export type Assessment = z.infer<typeof AssessmentSchema>;

/*
const AccessRuleSchema = z.intersection(
  AccessRuleSchema,
  z.object({
    role: z.undefined({
      invalid_type_error: 'DEPRECATED -- do not use.',
    }),
  }),
);
const AssessmentSchema = z.intersection(
  AssessmentSchema,
  z.object({
    advanceScorePerc: AccessRuleSchema.optional(),
  }),
);
*/
