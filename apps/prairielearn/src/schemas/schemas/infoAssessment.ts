import { z } from 'zod';

export default z
  .object({
    comment: z
      .union([z.string(), z.array(z.any()), z.object({}).catchall(z.any())])
      .describe('Arbitrary comment for reference purposes.')
      .optional(),
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
      .array(z.any())
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
      .array(z.any())
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
    groupRoles: z.array(z.any()).describe('Array of custom user roles in a group.').optional(),
    canSubmit: z
      .array(z.string())
      .describe(
        'A list of group role names that can submit questions in this assessment. Only applicable for group assessments.',
      )
      .optional(),
    canView: z
      .array(z.string())
      .describe(
        'A list of group role names that can view questions in this assessment. Only applicable for group assessments.',
      )
      .optional(),
    studentGroupCreate: z.boolean().describe('Whether students can create groups.').optional(),
    studentGroupJoin: z.boolean().describe('Whether students can join groups.').optional(),
    studentGroupLeave: z.boolean().describe('Whether students can leave groups.').optional(),
    advanceScorePerc: z.any().optional(),
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
