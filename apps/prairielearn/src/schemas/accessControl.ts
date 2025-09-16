import { z } from 'zod';

export const DeadlineEntryJsonSchema = z
  .object({
    date: z.string().describe('The deadline date in ISO 8601 format (e.g., "2024-03-17T23:59")'),
    credit: z.number().describe('The credit percentage for this deadline (e.g., 120 for 120%)'),
  })
  .describe('A deadline entry with date and credit percentage');

const PrairieTestExamJsonSchema = z
  .object({
    examUuid: z
      .string()
      .regex(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/)
      .describe('The PrairieTest exam UUID'),
    readOnly: z.boolean().describe('Whether this exam is read-only').optional(),
  })
  .describe('A PrairieTest exam configuration');

const DateControlJsonSchema = z
  .object({
    enabled: z.boolean().describe('Whether date control is enabled').optional(),

    releaseDateEnabled: z
      .boolean()
      .describe('Whether release date is enabled')
      .optional()
      .default(false),
    releaseDate: z
      .string()
      .describe('The release date in ISO 8601 format (e.g., "2024-03-14T00:01")')
      .optional(),

    dueDateEnabled: z.boolean().describe('Whether due date is enabled').optional(),
    dueDate: z
      .string()
      .describe('The due date in ISO 8601 format (e.g., "2024-03-21T23:59")')
      .optional(),

    earlyDeadlinesEnabled: z.boolean().describe('Whether early deadlines are enabled').optional(),
    earlyDeadlines: z
      .array(DeadlineEntryJsonSchema)
      .describe('Array of early deadline entries with credit percentages')
      .optional(),

    lateDeadlinesEnabled: z.boolean().describe('Whether late deadlines are enabled').optional(),
    lateDeadlines: z
      .array(DeadlineEntryJsonSchema)
      .describe('Array of late deadline entries with credit percentages')
      .optional(),

    afterLastDeadline: z
      .object({
        allowSubmissions: z
          .boolean()
          .describe('Whether submissions are allowed after the last deadline')
          .optional(),
        creditEnabled: z
          .boolean()
          .describe('Whether credit text box value is enabled and considered')
          .optional(),
        credit: z.number().describe('The credit percentage after the last deadline').optional(),
      })
      .describe('Configuration for behavior after the last deadline')
      .optional(),

    durationMinutesEnabled: z.boolean().describe('Whether duration limit is enabled').optional(),
    durationMinutes: z.number().positive().describe('The duration limit in minutes').optional(),

    passwordEnabled: z.boolean().describe('Whether password protection is enabled').optional(),
    password: z.string().describe('The password for accessing the assessment').optional(),
  })
  .describe('Date and time control configuration for the assessment');

const PrairieTestControlJsonSchema = z
  .object({
    enabled: z.boolean().describe('Whether PrairieTest control is enabled').optional(),
    exams: z
      .array(PrairieTestExamJsonSchema)
      .describe('Array of PrairieTest exam configurations')
      .optional(),
  })
  .describe('PrairieTest integration control configuration');

const AfterCompleteDateControlJsonSchema = z
  .object({
    showAgainDateEnabled: z.boolean().describe('Whether show again date is enabled').optional(),
    showAgainDate: z
      .string()
      .describe('The date when content should be shown again in ISO 8601 format')
      .optional(),
    hideAgainDateEnabled: z
      .boolean()
      .describe('Whether hide again date is enabled (only for hideQuestionsDateControl)')
      .optional(),
    hideAgainDate: z
      .string()
      .describe(
        'The date when content should be hidden again in ISO 8601 format (only for hideQuestionsDateControl)',
      )
      .optional(),
  })
  .describe('Date control configuration for after-complete behavior');

const AfterCompleteJsonSchema = z
  .object({
    hideQuestions: z.boolean().describe('Whether to hide questions after completion').optional(),
    hideQuestionsDateControl: AfterCompleteDateControlJsonSchema.describe(
      'Date control for hiding/showing questions after completion',
    ).optional(),
    hideScore: z.boolean().describe('Whether to hide score after completion').optional(),
    hideScoreDateControl: z
      .object({
        showAgainDateEnabled: z
          .boolean()
          .describe('Whether show again date is enabled for scores')
          .optional(),
        showAgainDate: z
          .string()
          .describe('The date when scores should be shown again in ISO 8601 format')
          .optional(),
      })
      .describe('Date control for hiding/showing scores after completion')
      .optional(),
  })
  .describe('Configuration for behavior after assessment completion');

export const AccessControlJsonSchema = z
  .object({
    // These three keys can't/shouldn't be inherited by overrides/other rules
    targets: z
      .array(z.string())
      .describe('Array of target identifiers (e.g., section names) that this rule applies to')
      .optional(),
    enabled: z
      .boolean()
      .describe('Whether this access rule should be considered')
      .optional()
      .default(true),
    blockAccess: z
      .boolean()
      .describe('Short circuit - deny access if this rule applies')
      .optional()
      .default(false),

    // All other keys are inherited by overrides/other rules
    listBeforeRelease: z
      .boolean()
      .describe('Whether students can see the title and click into the assessment before release')
      .optional(),

    dateControl: DateControlJsonSchema.optional(),
    prairieTestControl: PrairieTestControlJsonSchema.optional(),
    afterComplete: AfterCompleteJsonSchema.optional(),
  })
  .describe('Access control configuration for assessments');

export type AccessControlJson = z.infer<typeof AccessControlJsonSchema>;
export type AccessControlJsonInput = z.input<typeof AccessControlJsonSchema>;
