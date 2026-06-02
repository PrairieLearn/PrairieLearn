import { z } from 'zod';

import { DatetimeLocalStringSchema } from '@prairielearn/zod';

export const MAX_ACCESS_CONTROL_RULES = 20;
export const MAX_ENROLLMENT_ACCESS_CONTROL_RULES = 25;
export const MAX_ACCESS_CONTROL_STUDENT_LABELS_PER_RULE = 10;
export const MAX_ACCESS_CONTROL_ENROLLMENTS_PER_RULE = 50;
export const MAX_ACCESS_CONTROL_ENROLLMENTS_PER_ASSESSMENT = 250;
export const MAX_ACCESS_CONTROL_EARLY_DEADLINES_PER_RULE = 3;
export const MAX_ACCESS_CONTROL_LATE_DEADLINES_PER_RULE = 3;
export const MAX_ACCESS_CONTROL_PRAIRIETEST_EXAMS = 50;
export const MAX_ACCESS_CONTROL_UID_VALIDATION_BATCH_SIZE = 250;
export const MAX_ACCESS_CONTROL_DURATION_MINUTES = 2880;
export const MAX_ACCESS_CONTROL_PASSWORD_LENGTH = 128;

export const DeadlineEntryJsonSchema = z
  .object({
    date: DatetimeLocalStringSchema.describe('Date as ISO String for additional deadline'),
    credit: z.number().int().min(0).max(200).describe('Integer credit percentage to allow'),
  })
  .strict();

const AfterLastDeadlineJsonSchema = z
  .object({
    allowSubmissions: z.boolean(),
    credit: z.number().int().min(0).max(99).optional(),
  })
  .strict();

const ReleaseJsonSchema = z
  .object({
    date: DatetimeLocalStringSchema.describe('Release date as ISO String'),
  })
  .strict();

const DueJsonSchema = z
  .object({
    date: DatetimeLocalStringSchema.nullable().describe(
      'Due date as ISO String, or null for no due date',
    ),
    credit: z
      .number()
      .int()
      .min(0)
      .max(200)
      .optional()
      .describe(
        'Custom credit percentage at the due date (0-200). Omitted means default 100% credit.',
      ),
  })
  .strict();

const DateControlJsonSchema = z
  .object({
    release: ReleaseJsonSchema.optional().describe(
      'Controls when the assessment becomes available to students',
    ),
    due: DueJsonSchema.optional().describe(
      'Due date configuration. Overrides replace the entire due object atomically.',
    ),
    earlyDeadlines: z
      .array(DeadlineEntryJsonSchema)
      .max(MAX_ACCESS_CONTROL_EARLY_DEADLINES_PER_RULE)
      .nullable()
      .optional()
      .describe('Array of early deadlines with credit as percentages'),
    lateDeadlines: z
      .array(DeadlineEntryJsonSchema)
      .max(MAX_ACCESS_CONTROL_LATE_DEADLINES_PER_RULE)
      .nullable()
      .optional()
      .describe('Array of late deadlines with credit as percentages'),
    afterLastDeadline: AfterLastDeadlineJsonSchema.nullable()
      .describe(
        'Controls for assessment behavior after last deadline. Null means no access; omitted on overrides inherits from the default rule. On the default rule, omitting is equivalent to null (no access).',
      )
      .optional(),
    durationMinutes: z
      .number()
      .int()
      .positive()
      .max(MAX_ACCESS_CONTROL_DURATION_MINUTES)
      .nullable()
      .optional()
      .describe('Desired duration limit for assessment'),
    password: z
      .string()
      .min(1, 'Password cannot be empty')
      .max(MAX_ACCESS_CONTROL_PASSWORD_LENGTH)
      .nullable()
      .optional()
      .describe('Password for assessment'),
  })
  .strict()
  .optional();

const ExamAfterCompleteJsonSchema = z
  .object({
    questions: z.object({ hidden: z.boolean() }).strict().optional(),
    score: z.object({ hidden: z.boolean() }).strict().optional(),
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
    afterComplete: ExamAfterCompleteJsonSchema.describe(
      'Controls visibility after the student finishes the assessment during an active PrairieTest reservation. Only applies while a matching reservation is active; ignored otherwise.',
    ),
  })
  .strict();

const PrairieTestJsonSchema = z
  .object({
    exams: z
      .array(ExamJsonSchema)
      .max(MAX_ACCESS_CONTROL_PRAIRIETEST_EXAMS)
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

const AfterCompleteQuestionsJsonSchema = z
  .object({
    hidden: z.boolean(),
    visibleFromDate: DatetimeLocalStringSchema.optional(),
    visibleUntilDate: DatetimeLocalStringSchema.optional(),
  })
  .strict()
  .optional();

const AfterCompleteScoreJsonSchema = z
  .object({
    hidden: z.boolean(),
    visibleFromDate: DatetimeLocalStringSchema.optional(),
  })
  .strict()
  .optional();

const AfterCompleteJsonSchema = z
  .object({
    questions: AfterCompleteQuestionsJsonSchema,
    score: AfterCompleteScoreJsonSchema,
  })
  .strict()
  .optional();

const BeforeReleaseJsonSchema = z
  .object({
    listed: z
      .boolean()
      .describe(
        'Whether to list the assessment title before the release date. Students can see the title but cannot open the assessment.',
      ),
  })
  .strict()
  .optional();

export const AccessControlJsonSchema = z
  .object({
    labels: z
      .array(z.string().min(1).max(255))
      .max(MAX_ACCESS_CONTROL_STUDENT_LABELS_PER_RULE)
      .optional()
      .describe('Array of student label names this set targets'),
    beforeRelease: BeforeReleaseJsonSchema.describe(
      'Only valid on the first entry (defaults). Controls assessment visibility before the release date.',
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
