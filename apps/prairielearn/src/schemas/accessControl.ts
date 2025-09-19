import { z } from 'zod';

import { DateFromISOString } from '@prairielearn/zod';

export { DateFromISOString };

// TODO: Intuition: To prevent JSON users from creating roles that don't have intended effects, it might be nice to enforce that if an *enabled field is set to NULL
// (i.e. inherit), we disallow the value to be set.
const createEnabledFieldValidator = (pairs: Array<[string, string]>) => {
  return (data: any) => {
    for (const [enabledField, valueField] of pairs) {
      if (data[enabledField] === null && data[valueField] !== undefined) {
        return false;
      }
    }
    return true;
  };
};

// TODO:
// Assignment-Level access control cannot inherit as there is nothing to inherit from. Thus, *enabled fields cannot be NULL.
// This wouldn't be a problem in the UI, but for users that prefer to edit the JSON, it might be nice to do some validation to prevent non-sensical configs.
// Should we validate this? How do we want to handle this in general?
const createAssignmentLevelValidator = (enabledFields: string[]) => {
  return (data: any, ctx: any) => {
    const isAssignmentLevel = !data.targets || data.targets.length === 0;

    if (isAssignmentLevel) {
      const checkForNullEnabled = (obj: any, path: string[] = []) => {
        if (!obj || typeof obj !== 'object') return; // If we are not an object, stop.

        for (const [key, value] of Object.entries(obj)) {
          const currentPath = [...path, key];

          if (key.endsWith('Enabled') && value === null) {
            ctx.addIssue({
              code: 'custom',
              message: `Assignment-level permissions cannot have null *Enabled fields (found null ${key})`,
              path: currentPath,
            });
          } else if (typeof value === 'object' && value !== null) {
            checkForNullEnabled(value, currentPath);
          }
        }
      };

      checkForNullEnabled(data);
    }
  };
};

const DeadlineSchema = z
  .object({
    date: DateFromISOString.describe('Date as ISO String for additional deadline'),
    credit: z.number().describe('Amount of credit as a percent to allow'),
  })
  .optional();

const AfterLastDeadlineSchema = z
  .object({
    allowSubmissions: z.boolean().optional(),
    creditEnabled: z.boolean().nullable().optional(),
    credit: z.number().optional(),
  })
  .refine(createEnabledFieldValidator([['creditEnabled', 'credit']]), {
    message: 'When creditEnabled is null, credit cannot be populated',
  })
  .optional();

const DateControlSchema = z
  .object({
    enabled: z.boolean().nullable().optional(),
    releaseDateEnabled: z
      .boolean()
      .nullable()
      .optional()
      .describe('Whether to enable release date'),
    releaseDate: DateFromISOString.optional().describe('Deadline date as ISO String'),
    dueDateEnabled: z.boolean().nullable().optional().describe('Whether to enable due date'),
    dueDate: DateFromISOString.optional().describe('Due date as ISO String'),
    earlyDeadlinesEnabled: z
      .boolean()
      .nullable()
      .optional()
      .describe('Whether to enable early deadlines'),
    earlyDeadlines: z
      .array(DeadlineSchema)
      .optional()
      .describe('Array of early deadlines with credit as percentages'),
    lateDeadlinesEnabled: z
      .boolean()
      .nullable()
      .optional()
      .describe('Whether to enable late deadlines'),
    lateDeadlines: z
      .array(DeadlineSchema)
      .optional()
      .describe('Array of late deadlines with credit as percentages'),
    afterLastDeadline: AfterLastDeadlineSchema.describe(
      'Controls for assessment behaviour after last deadline',
    ),
    durationMinutesEnabled: z
      .boolean()
      .nullable()
      .optional()
      .describe('Whether to enable duration minutes'),
    durationMinutes: z.number().optional().describe('Desired duration limit for assessment'),
    passwordEnabled: z.boolean().nullable().optional().describe('Whether to enable password'),
    password: z.string().optional().describe('Password for assessment'),
  })
  .refine(
    createEnabledFieldValidator([
      ['releaseDateEnabled', 'releaseDate'],
      ['dueDateEnabled', 'dueDate'],
      ['earlyDeadlinesEnabled', 'earlyDeadlines'],
      ['lateDeadlinesEnabled', 'lateDeadlines'],
      ['durationMinutesEnabled', 'durationMinutes'],
      ['passwordEnabled', 'password'],
    ]),
    { message: 'When an *Enabled field is null, the corresponding field cannot be populated' },
  )
  .optional();

const ExamSchema = z
  .object({
    examUuid: z.string().describe('UUID of associated PrairieTest exam'),
    readOnly: z.boolean().optional().describe('Whether the exam is read-only for students'),
  })
  .optional();

const PrairieTestControlSchema = z
  .object({
    enabled: z.boolean().optional().describe('Whether to enable PrairieTest controls'),
    exams: z.array(ExamSchema).optional().describe('Array of associated PrairieTest exam configs'),
  })
  .optional();

const HideQuestionsDateControlSchema = z
  .object({
    showAgainDateEnabled: z
      .boolean()
      .nullable()
      .optional()
      .describe(
        'Whether to enable the ability for revealing hidden questions after assessment completion',
      ),
    showAgainDate: DateFromISOString.optional().describe(
      'Date as ISO String for when to unhide questions to students after assessment completion',
    ),
    hideAgainDateEnabled: z
      .boolean()
      .nullable()
      .optional()
      .describe(
        'Whether to enable the ability for re-hiding revealed questions after assessment completion',
      ),
    hideAgainDate: DateFromISOString.optional().describe(
      'Date as ISO String for when to rehide questions to students after assessment completion',
    ),
  })
  .refine(
    createEnabledFieldValidator([
      ['showAgainDateEnabled', 'showAgainDate'],
      ['hideAgainDateEnabled', 'hideAgainDate'],
    ]),
    { message: 'When a *DateEnabled field is null, the corresponding date cannot be populated' },
  )
  .optional();

const HideScoreDateControlSchema = z
  .object({
    showAgainDateEnabled: z
      .boolean()
      .nullable()
      .optional()
      .describe('Whether to enable the ability to show hidden scores after assessment completion'),
    showAgainDate: DateFromISOString.optional().describe(
      'Date as ISO String for when to reveal hidden scores after assessment completion',
    ),
  })
  .refine(createEnabledFieldValidator([['showAgainDateEnabled', 'showAgainDate']]), {
    message: 'When showAgainDateEnabled is null, showAgainDate cannot be populated',
  })
  .optional();

const AfterCompleteSchema = z
  .object({
    hideQuestions: z
      .boolean()
      .optional()
      .describe(
        'Whether to enable settings controlling question visibility after assessment completion',
      ),
    hideQuestionsDateControl: HideQuestionsDateControlSchema.describe(
      'Settings controlling question visibility after assessment completion',
    ),
    hideScore: z
      .boolean()
      .optional()
      .describe(
        'Whether to enable settings controlling score visibility after assessment completion',
      ),
    hideScoreDateControl: HideScoreDateControlSchema.describe(
      'Settings controlling question visibility after assessment completion',
    ),
  })
  .optional();

const AccessControlJsonSchema = z
  .object({
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
    dateControl: DateControlSchema,
    prairieTestControl: PrairieTestControlSchema,
    afterComplete: AfterCompleteSchema,
  })
  .superRefine(createAssignmentLevelValidator([]))
  .optional();

export type AccessControlJson = z.infer<typeof AccessControJsonlSchema>;
export type AccessControlJsonInput = z.input<typeof AccessControlJsonSchema>;
