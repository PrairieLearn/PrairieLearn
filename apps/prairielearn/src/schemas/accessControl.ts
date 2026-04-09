import { z } from 'zod';

import { DatetimeLocalStringSchema } from '@prairielearn/zod';

export const DeadlineEntryJsonSchema = z
  .object({
    date: DatetimeLocalStringSchema.describe('Date as ISO String for additional deadline'),
    credit: z.number().min(0).max(200).describe('Amount of credit as a percent to allow'),
  })
  .strict();

const AfterLastDeadlineJsonSchema = z
  .object({
    allowSubmissions: z.boolean().optional(),
    credit: z.number().min(0).optional(),
  })
  .strict();

const DateControlJsonSchema = z
  .object({
    releaseDate: DatetimeLocalStringSchema.optional().describe('Release date as ISO String'),
    dueDate: DatetimeLocalStringSchema.nullable().optional().describe('Due date as ISO String'),
    earlyDeadlines: z
      .array(DeadlineEntryJsonSchema)
      .nullable()
      .optional()
      .describe('Array of early deadlines with credit as percentages'),
    lateDeadlines: z
      .array(DeadlineEntryJsonSchema)
      .nullable()
      .optional()
      .describe('Array of late deadlines with credit as percentages'),
    afterLastDeadline: AfterLastDeadlineJsonSchema.nullable()
      .describe('Controls for assessment behaviour after last deadline')
      .optional(),
    durationMinutes: z
      .number()
      .int()
      .positive()
      .nullable()
      .optional()
      .describe('Desired duration limit for assessment'),
    password: z
      .string()
      .min(1, 'Password cannot be empty')
      .nullable()
      .optional()
      .describe('Password for assessment'),
  })
  .strict()
  .optional();

const ExamJsonSchema = z
  .object({
    examUuid: z
      .string()
      .regex(
        /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
        'Invalid UUID format',
      )
      .describe('UUID of associated PrairieTest exam'),
    readOnly: z.boolean().optional().describe('Whether the exam is read-only for students'),
  })
  .strict();

const PrairieTestJsonSchema = z
  .object({
    exams: z
      .array(ExamJsonSchema)
      .optional()
      .describe('Array of associated PrairieTest exam configs'),
  })
  .strict()
  .optional();

const IntegrationsJsonSchema = z
  .object({
    prairieTest: PrairieTestJsonSchema,
  })
  .strict()
  .optional();

const AfterCompleteJsonSchema = z
  .object({
    hideQuestions: z
      .boolean()
      .optional()
      .describe(
        'Whether to hide questions after assessment completion. When false, questions are shown until showQuestionsAgainDate (if set).',
      ),
    showQuestionsAgainDate: DatetimeLocalStringSchema.nullable()
      .optional()
      .describe(
        'Date as ISO String for when hidden questions become visible again after assessment completion',
      ),
    hideQuestionsAgainDate: DatetimeLocalStringSchema.nullable()
      .optional()
      .describe('Date as ISO String for when questions are re-hidden after being shown again'),
    hideScore: z
      .boolean()
      .optional()
      .describe(
        'Whether to hide scores after assessment completion. When true, scores are hidden until showScoreAgainDate (if set).',
      ),
    showScoreAgainDate: DatetimeLocalStringSchema.nullable()
      .optional()
      .describe(
        'Date as ISO String for when hidden scores become visible again after assessment completion',
      ),
  })
  .strict()
  .optional();

export const AccessControlJsonSchema = z
  .object({
    labels: z
      .array(z.string())
      .optional()
      .describe('Array of student label names this set targets'),
    listBeforeRelease: z
      .boolean()
      .optional()
      .describe(
        'Only valid on the first entry (defaults). Whether to list the assessment title before the release date. Students can see the title but cannot open the assessment. Defaults to false.',
      ),

    dateControl: DateControlJsonSchema,
    integrations: IntegrationsJsonSchema,
    afterComplete: AfterCompleteJsonSchema,
  })
  .strict();

export type AccessControlJson = z.infer<typeof AccessControlJsonSchema>;
// With no .default() transforms, input and output types are identical.
// Keep the alias for callers that distinguish conceptually between the two.
export type AccessControlJsonInput = AccessControlJson;
