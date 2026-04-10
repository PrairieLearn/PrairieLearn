import { z } from 'zod';

import { DatetimeLocalStringSchema } from '@prairielearn/zod';

export const DeadlineEntryJsonSchema = z
  .object({
    date: DatetimeLocalStringSchema.describe('Date as ISO String for additional deadline'),
    credit: z.number().min(0).max(200).describe('Amount of credit as a percent to allow'),
  })
  .strict();

const AfterLastDeadlineJsonSchema = z.discriminatedUnion('allowSubmissions', [
  z.object({ allowSubmissions: z.literal(false), credit: z.null().optional() }).strict(),
  z
    .object({
      allowSubmissions: z.literal(true),
      credit: z.number().min(0).nullable().optional(),
    })
    .strict(),
]);

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
    afterLastDeadline: AfterLastDeadlineJsonSchema.describe(
      'Controls for assessment behaviour after last deadline',
    ).optional(),
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

const QuestionsJsonSchema = z.union([
  z
    .object({
      hidden: z.literal(false),
      visibleFrom: z.null().optional(),
      visibleUntil: z.null().optional(),
    })
    .strict(),
  z
    .object({
      hidden: z.literal(true),
      visibleFrom: z.null().optional(),
      visibleUntil: z.null().optional(),
    })
    .strict(),
  z
    .object({
      hidden: z.literal(true),
      visibleFrom: DatetimeLocalStringSchema,
      visibleUntil: DatetimeLocalStringSchema.nullable().optional(),
    })
    .strict(),
]);

const ScoreJsonSchema = z.union([
  z.object({ hidden: z.literal(false), visibleFrom: z.null().optional() }).strict(),
  z
    .object({
      hidden: z.literal(true),
      visibleFrom: DatetimeLocalStringSchema.nullable().optional(),
    })
    .strict(),
]);

const AfterCompleteQuestionsJsonSchema = z
  .union([
    // No hidden, no visibleFrom — visibleUntil not allowed.
    z
      .object({
        visibleFrom: z.null().optional(),
        visibleUntil: z.null().optional(),
      })
      .strict(),
    // No hidden, with visibleFrom — visibleUntil allowed.
    z
      .object({
        visibleFrom: DatetimeLocalStringSchema,
        visibleUntil: DatetimeLocalStringSchema.nullable().optional(),
      })
      .strict(),
    // With hidden — delegate to the union.
    QuestionsJsonSchema,
  ])
  .optional();

const AfterCompleteScoreJsonSchema = z
  .union([
    // When hidden is absent (override inheriting boolean from defaults), allow any date fields.
    z
      .object({
        visibleFrom: DatetimeLocalStringSchema.nullable().optional(),
      })
      .strict(),
    // When hidden is present, use the discriminated union rules.
    ScoreJsonSchema,
  ])
  .optional();

const AfterCompleteJsonSchema = z
  .object({
    questions: AfterCompleteQuestionsJsonSchema,
    score: AfterCompleteScoreJsonSchema,
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
