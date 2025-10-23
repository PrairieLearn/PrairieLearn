import { z } from 'zod';

export const DeadlineEntryJsonSchema = z.object({
  date: z.string().describe('Date as ISO String for additional deadline'),
  credit: z.number().describe('Amount of credit as a percent to allow'),
});

const AfterLastDeadlineJsonSchema = z.object({
  allowSubmissions: z.boolean().optional(),
  credit: z.number().optional(),
});

const DateControlJsonSchema = z
  .object({
    enabled: z.boolean().optional().describe('Whether dateControl is enabled or not'),
    releaseDate: z.string().optional().describe('Deadline date as ISO String'),
    dueDate: z.string().nullable().optional().describe('Due date as ISO String'),
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
      .optional()
      .describe('Desired duration limit for assessment'),
    password: z.string().nullable().optional().describe('Password for assessment'),
  })
  .optional();

const ExamJsonSchema = z.object({
  examUuid: z.string().describe('UUID of associated PrairieTest exam'),
  readOnly: z.boolean().optional().describe('Whether the exam is read-only for students'),
});

const PrairieTestControlJsonSchema = z
  .object({
    enabled: z.boolean().optional().describe('Whether praireTestControl is enabled or not'),
    exams: z
      .array(ExamJsonSchema)
      .optional()
      .describe('Array of associated PrairieTest exam configs'),
  })
  .optional();

const HideQuestionsDateControlJsonSchema = z
  .object({
    showAgainDate: z
      .string()
      .optional()
      .describe(
        'Date as ISO String for when to unhide questions to students after assessment completion',
      ),
    hideAgainDate: z
      .string()
      .optional()
      .describe(
        'Date as ISO String for when to rehide questions to students after assessment completion',
      ),
  })
  .optional();

const HideScoreDateControlJsonSchema = z
  .object({
    showAgainDate: z
      .string()
      .optional()
      .describe('Date as ISO String for when to reveal hidden scores after assessment completion'),
  })
  .optional();

const AfterCompleteJsonSchema = z
  .object({
    hideQuestions: z
      .boolean()
      .optional()
      .describe(
        'Whether to enable settings controlling question visibility after assessment completion',
      ),
    hideQuestionsDateControl: HideQuestionsDateControlJsonSchema.describe(
      'Settings controlling question visibility after assessment completion',
    ),
    hideScore: z
      .boolean()
      .optional()
      .describe(
        'Whether to enable settings controlling score visibility after assessment completion',
      ),
    hideScoreDateControl: HideScoreDateControlJsonSchema.describe(
      'Settings controlling score visibility after assessment completion',
    ),
  })
  .optional();

export const AccessControlJsonSchema = z.object({
  name: z.string().optional().describe('Name for AccessControl rule'),
  targets: z
    .array(z.string())
    .optional()
    .describe('Array of (User, Access Control Group) ids this set targets'),
  enabled: z
    .boolean()
    .optional()
    .describe('Whether this set of permissions is enabled')
    .default(true), // default true if not set
  blockAccess: z
    .boolean()
    .optional()
    .describe('Short circuit for whether the targets should have access to the assessment')
    .default(false), // default false if not set

  listBeforeRelease: z
    .boolean()
    .optional()
    .describe('Whether students can see the title and click into the assessment before release'),

  dateControl: DateControlJsonSchema,
  prairieTestControl: PrairieTestControlJsonSchema,
  afterComplete: AfterCompleteJsonSchema,
});

export type AccessControlJson = z.infer<typeof AccessControlJsonSchema>;
export type AccessControlJsonInput = z.input<typeof AccessControlJsonSchema>;
