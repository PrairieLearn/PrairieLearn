import { type ZodSchema, z } from 'zod';

import { CommentJsonSchema } from './comment.js';

function uniqueArray<T extends ZodSchema>(schema: T) {
  return z.array(schema).refine((items) => new Set(items).size === items.length, {
    message: 'All items must be unique, no duplicate values allowed',
  });
}

// TODO: This schema is being deprecated
// https://github.com/PrairieLearn/PrairieLearn/issues/13545
export const LegacyGroupRoleJsonSchema = z
  .object({
    name: z.string().describe("The group role's name (i.e. Manager, Reflector, Recorder)."),
    minimum: z
      .number()
      .describe('The minimum number of users that should be in this role in a group.')
      .optional()
      .default(0),
    maximum: z
      .number()
      .describe('The maximum number of users that should be in this role in a group.')
      .optional(),
    canAssignRoles: z
      .boolean()
      .describe("Whether users with this role can assign other users' group roles.")
      .optional()
      .default(false),
  })
  .describe(
    'A custom role for use in group assessments that allows control over certain permissions.',
  );

export const GroupsRoleJsonSchema = z
  .object({
    name: z.string().describe("The group role's name (e.g., Manager, Recorder)."),
    minMembers: z
      .number()
      .describe('The minimum number of users that should be in this role.')
      .optional()
      .default(0),
    maxMembers: z
      .number()
      .describe('The maximum number of users that should be in this role.')
      .optional(),
  })
  .describe('A custom role for use in group assessments.');

export type GroupsRoleJson = z.infer<typeof GroupsRoleJsonSchema>;

const GroupsStudentPermissionsJsonSchema = z
  .object({
    canCreateGroup: z
      .boolean()
      .describe('Whether students can create groups.')
      .optional()
      .default(false),
    canJoinGroup: z
      .boolean()
      .describe('Whether students can join groups.')
      .optional()
      .default(false),
    canLeaveGroup: z
      .boolean()
      .describe('Whether students can leave groups.')
      .optional()
      .default(false),
    canNameGroup: z
      .boolean()
      .describe('Whether students can choose a group name when creating a group.')
      .optional()
      .default(true),
  })
  .describe('Student permissions for group management.');

const GroupsRolePermissionsJsonSchema = z
  .object({
    canAssignRoles: uniqueArray(z.string())
      .describe('Role names that can assign other users to roles.')
      .optional()
      .default([]),
    canView: uniqueArray(z.string())
      .describe('Role names that can view questions.')
      .optional()
      .default([]),
    canSubmit: uniqueArray(z.string())
      .describe('Role names that can submit questions.')
      .optional()
      .default([]),
  })
  .describe('Role-based permissions for group assessments.');

export const GroupsJsonSchema = z
  .object({
    enabled: z
      .boolean()
      .describe('Whether groups are enabled for this assessment.')
      .optional()
      .default(true),
    minMembers: z.number().describe('Minimum number of students in a group.').optional(),
    maxMembers: z.number().describe('Maximum number of students in a group.').optional(),
    roles: z
      .array(GroupsRoleJsonSchema)
      .describe('Array of custom user roles in a group.')
      .optional()
      .default([]),
    studentPermissions: GroupsStudentPermissionsJsonSchema.optional().default({}),
    rolePermissions: GroupsRolePermissionsJsonSchema.optional().default({}),
  })
  .strict()
  .describe('Configuration for group-based assessments.');

export type GroupsJson = z.infer<typeof GroupsJsonSchema>;
export type GroupsJsonInput = z.input<typeof GroupsJsonSchema>;

export const AssessmentAccessRuleJsonSchema = z
  .object({
    comment: CommentJsonSchema.optional(),
    mode: z.enum(['Public', 'Exam']).describe('The server mode required for access.').optional(),
    examUuid: z
      .string()
      .regex(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/)
      .describe(
        'The PrairieTest exam UUID for which a student must be registered. Implies mode: Exam.',
      )
      .optional(),
    role: z.enum(['Student', 'TA', 'Instructor']).describe('DEPRECATED -- do not use.').optional(),
    uids: z
      .array(z.string())
      .describe(
        "A list of UIDs (like 'username@example.com'), one of which is required for access.",
      )
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
      .optional()
      .default(true),
    showClosedAssessmentScore: z
      .boolean()
      .describe(
        'Whether the student can view the assessment grade after it has been closed. Only works if showClosedAssessment is also set to false',
      )
      .optional()
      .default(true),
    active: z
      .boolean()
      .describe(
        'Whether the student can create a new assessment instance and submit answers to questions. If set to false, the available credit must be 0.',
      )
      .optional()
      .default(true),
  })
  .strict()
  .describe(
    'An access rule that permits people to access this assessment. All restrictions in the rule must be satisfied for the rule to allow access.',
  );

export const PointsSingleJsonSchema = z
  .number()
  .gte(0)
  .default(0)
  .describe('A single point value.');

export const PointsListJsonSchema = z
  .array(PointsSingleJsonSchema)
  .min(1)
  .describe('An array of point values.');

export const PointsJsonSchema = z.union([PointsSingleJsonSchema, PointsListJsonSchema]);

export const QuestionIdJsonSchema = z
  .string()
  .describe('Question ID (directory name of the question).');

export const ForceMaxPointsJsonSchema = z
  .boolean()
  .describe('Whether to force this question to be awarded maximum points on a regrade.');

export const AdvanceScorePercJsonSchema = z
  .number()
  .gte(0)
  .lte(100)
  .describe('Minimum score percentage to unlock access to subsequent questions.');

const QuestionPointsJsonSchema = z.object({
  points: PointsJsonSchema.optional(),
  autoPoints: PointsJsonSchema.optional(),
  maxPoints: PointsSingleJsonSchema.optional(),
  maxAutoPoints: PointsSingleJsonSchema.optional(),
  manualPoints: PointsSingleJsonSchema.optional(),
});

export type QuestionPointsJson = z.infer<typeof QuestionPointsJsonSchema>;

export const QuestionAlternativeJsonSchema = QuestionPointsJsonSchema.extend({
  comment: CommentJsonSchema.optional(),
  id: QuestionIdJsonSchema,
  forceMaxPoints: ForceMaxPointsJsonSchema.optional(),
  triesPerVariant: z
    .number()
    .int()
    .gte(1)
    .describe('The maximum number of graded submissions allowed for each question instance.')
    .optional(),
  advanceScorePerc: AdvanceScorePercJsonSchema.optional(),
  gradeRateMinutes: z
    .number()
    .gte(0)
    .describe(
      'Minimum amount of time (in minutes) between graded submissions to the same question.',
    )
    .optional(),
  allowRealTimeGrading: z
    .boolean()
    .describe(
      'Whether to allow real-time grading for this question alternative. If not specified, inherits from the question level.',
    )
    .optional(),
});

export type QuestionAlternativeJson = z.infer<typeof QuestionAlternativeJsonSchema>;

// 'Block' is used to signify that this can either be a single question, or
// a container for multiple question alternatives.
export const ZoneQuestionBlockJsonSchema = QuestionPointsJsonSchema.extend({
  comment: CommentJsonSchema.optional(),
  points: PointsJsonSchema.optional(),
  autoPoints: PointsJsonSchema.optional(),
  maxPoints: PointsSingleJsonSchema.optional(),
  maxAutoPoints: PointsSingleJsonSchema.optional(),
  manualPoints: PointsSingleJsonSchema.optional(),
  id: QuestionIdJsonSchema.optional(),
  forceMaxPoints: ForceMaxPointsJsonSchema.optional(),
  alternatives: z
    .array(QuestionAlternativeJsonSchema)
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
    .int()
    .gte(1)
    .describe('The maximum number of graded submissions allowed for each question instance.')
    .optional(),
  advanceScorePerc: AdvanceScorePercJsonSchema.optional(),
  gradeRateMinutes: z
    .number()
    .gte(0)
    .describe(
      'Minimum amount of time (in minutes) between graded submissions to the same question.',
    )
    .optional(),
  allowRealTimeGrading: z
    .boolean()
    .describe(
      'Whether to allow real-time grading for this question. If not specified, inherits from the zone level.',
    )
    .optional(),
  canSubmit: uniqueArray(z.string())
    .describe(
      'A list of group role names that can submit the question. Only applicable for group assessments.',
    )
    .optional()
    .default([]),
  canView: uniqueArray(z.string())
    .describe(
      'A list of group role names that can view the question. Only applicable for group assessments.',
    )
    .optional()
    .default([]),
});

export type ZoneQuestionBlockJson = z.infer<typeof ZoneQuestionBlockJsonSchema>;

export const ZoneAssessmentJsonSchema = z.object({
  title: z
    .string()
    .describe('Zone title, displayed to the students at the top of the question list for the zone.')
    .optional(),
  comment: CommentJsonSchema.optional(),
  // Do we need to allow for additional keys?
  comments: CommentJsonSchema.optional().describe('DEPRECATED -- do not use.'),
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
  lockpoint: z
    .boolean()
    .describe(
      'If true, students must explicitly acknowledge advancing past this point. All questions in previous zones become read-only after crossing.',
    )
    .optional()
    .default(false),
  questions: z
    .array(ZoneQuestionBlockJsonSchema)
    .min(1)
    .describe('Array of questions in the zone.'),
  advanceScorePerc: AdvanceScorePercJsonSchema.optional(),
  gradeRateMinutes: z
    .number()
    .gte(0)
    .describe(
      'Minimum amount of time (in minutes) between graded submissions to the same question.',
    )
    .optional(),
  allowRealTimeGrading: z
    .boolean()
    .describe(
      'Whether to allow real-time grading for questions in this zone. If not specified, inherits from the assessment level.',
    )
    .optional(),
  canSubmit: uniqueArray(z.string())
    .describe(
      'A list of group role names that can submit questions in this zone. Only applicable for group assessments.',
    )
    .optional()
    .default([]),
  canView: uniqueArray(z.string())
    .describe(
      'A list of group role names that can view questions in this zone. Only applicable for group assessments.',
    )
    .optional()
    .default([]),
});

export type ZoneAssessmentJson = z.infer<typeof ZoneAssessmentJsonSchema>;
export type ZoneAssessmentJsonInput = z.input<typeof ZoneAssessmentJsonSchema>;

export const AssessmentJsonSchema = z
  .object({
    comment: CommentJsonSchema.optional(),
    uuid: z
      .string()
      .regex(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/)
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
      .optional()
      .default(true),
    multipleInstance: z
      .boolean()
      .describe('Whether to allow students to create additional instances of the assessment')
      .optional()
      .default(false),
    shuffleQuestions: z
      .boolean()
      .describe(
        'Whether the questions will be shuffled in the student view of an assessment. If the assessment type is Exam, this is true by default, and otherwise false.',
      )
      .optional(),
    allowAccess: z
      .array(AssessmentAccessRuleJsonSchema)
      .describe(
        'List of access rules for the assessment. Access is permitted if any access rule is satisfied.',
      )
      .optional()
      .default([]),
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
      .optional()
      .default(true),
    autoClose: z
      .boolean()
      .describe('Whether to automatically close the assessment after a period of inactivity.')
      .optional()
      .default(true),
    zones: z
      .array(ZoneAssessmentJsonSchema)
      .describe(
        'Array of "zones" in the assessment, each containing questions that can be randomized within the zone.',
      )
      .optional()
      .default([]),
    constantQuestionValue: z
      .boolean()
      .describe(
        'Whether to keep the value of a question constant after a student solves it correctly.',
      )
      .optional()
      .default(false),
    allowRealTimeGrading: z
      .boolean()
      .describe(
        'Removes the student "Grade" buttons to prevent real-time grading while the assessment is being taken. Real-time grading is allowed by default.',
      )
      .optional(),
    requireHonorCode: z
      .boolean()
      .describe(
        'Requires the student to accept an honor code before starting the assessment. Set to true for Exam assessments by default. Only configurable for Exam assessments.',
      )
      .optional(),
    honorCode: z
      .string()
      .describe(
        'Custom text for the honor code to be accepted before starting the assessment. Only available for Exam assessments.',
      )
      .optional(),
    groupWork: z
      .boolean()
      .describe(
        'Whether the assessment will support group work. DEPRECATED -- prefer using the "groups" property instead.',
      )
      .optional()
      .default(false),
    groupMaxSize: z
      .number()
      .describe(
        'Maximum number of students in a group. DEPRECATED -- prefer using the "groups" property instead.',
      )
      .optional(),
    groupMinSize: z
      .number()
      .describe(
        'Minimum number of students in a group. DEPRECATED -- prefer using the "groups" property instead.',
      )
      .optional(),
    groupRoles: z
      .array(LegacyGroupRoleJsonSchema)
      .describe(
        'Array of custom user roles in a group. DEPRECATED -- prefer using the "groups" property instead.',
      )
      .optional()
      .default([]),
    canSubmit: uniqueArray(z.string())
      .describe(
        'A list of group role names that can submit questions. Only applicable for group assessments. DEPRECATED -- prefer using the "groups" property instead.',
      )
      .optional()
      .default([]),
    canView: uniqueArray(z.string())
      .describe(
        'A list of group role names that can view questions. Only applicable for group assessments. DEPRECATED -- prefer using the "groups" property instead.',
      )
      .optional()
      .default([]),
    studentGroupCreate: z
      .boolean()
      .describe(
        'Whether students can create groups. DEPRECATED -- prefer using the "groups" property instead.',
      )
      .optional()
      .default(false),
    studentGroupChooseName: z
      .boolean()
      .describe(
        'Whether students can choose a group name when creating a group. Only applicable if studentGroupCreate is true. DEPRECATED -- prefer using the "groups" property instead.',
      )
      .optional()
      .default(true),
    studentGroupJoin: z
      .boolean()
      .describe(
        'Whether students can join groups. DEPRECATED -- prefer using the "groups" property instead.',
      )
      .optional()
      .default(false),
    studentGroupLeave: z
      .boolean()
      .describe(
        'Whether students can leave groups. DEPRECATED -- prefer using the "groups" property instead.',
      )
      .optional()
      .default(false),
    groups: GroupsJsonSchema.optional(),
    advanceScorePerc: AdvanceScorePercJsonSchema.optional(),
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
    shareSourcePublicly: z
      .boolean()
      .describe(
        "If true, the assessment's JSON configuration and question list are available for others to view and copy.",
      )
      .optional()
      .default(false),
  })
  .strict()
  .describe('Configuration data for an assessment.');

export type AssessmentJson = z.infer<typeof AssessmentJsonSchema>;
export type AssessmentJsonInput = z.input<typeof AssessmentJsonSchema>;
