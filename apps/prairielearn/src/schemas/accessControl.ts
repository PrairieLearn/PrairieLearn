import { z } from 'zod';

import { DatetimeLocalStringSchema } from '@prairielearn/zod';

export const DeadlineEntryJsonSchema = z
  .object({
    date: DatetimeLocalStringSchema.describe('Date as ISO String for additional deadline'),
    credit: z.number().describe('Amount of credit as a percent to allow'),
  })
  .strict();

const AfterLastDeadlineJsonSchema = z
  .object({
    allowSubmissions: z.boolean().optional(),
    credit: z.number().optional(),
  })
  .strict();

const DateControlJsonSchema = z
  .object({
    releaseDate: DatetimeLocalStringSchema.nullable()
      .optional()
      .describe('Release date as ISO String. If absent or null, no date-based access is granted.'),
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
        'Whether to enable settings controlling question visibility after assessment completion',
      ),
    showQuestionsAgainDate: DatetimeLocalStringSchema.optional().describe(
      'Date as ISO String for when to unhide questions to students after assessment completion',
    ),
    hideQuestionsAgainDate: DatetimeLocalStringSchema.optional().describe(
      'Date as ISO String for when to rehide questions to students after unhiding questions after assessment completion',
    ),
    hideScore: z
      .boolean()
      .optional()
      .describe(
        'Whether to enable settings controlling score visibility after assessment completion',
      ),
    showScoreAgainDate: DatetimeLocalStringSchema.optional().describe(
      'Date as ISO String for when to reveal hidden scores after assessment completion',
    ),
  })
  .strict()
  .optional();

export const AccessControlJsonSchema = z
  .object({
    name: z.string().optional().describe('Name for AccessControl rule'),
    labels: z
      .array(z.string())
      .optional()
      .describe('Array of student label names this set targets'),
    listBeforeRelease: z
      .boolean()
      .optional()
      .nullable()
      .describe(
        'Main rule only. Whether students can see the assessment title before the release date. Defaults to false.',
      ),

    dateControl: DateControlJsonSchema,
    integrations: IntegrationsJsonSchema,
    afterComplete: AfterCompleteJsonSchema,
  })
  .strict();

export type AccessControlJson = z.infer<typeof AccessControlJsonSchema>;
export type AccessControlJsonInput = z.input<typeof AccessControlJsonSchema>;
