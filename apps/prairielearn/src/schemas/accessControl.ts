import { z } from 'zod';

export const DeadlineEntryJsonSchema = z.object({
  date: z.string().describe('Date as ISO String for additional deadline'),
  credit: z.number().describe('Amount of credit as a percent to allow'),
});

const AfterLastDeadlineJsonSchema = z.object({
  allowSubmissions: z.boolean(),
  credit: z.number(),
});

const DateControlJsonSchema = z.object({
  // enabled: z.boolean().optional().describe('Whether dateControl is enabled or not'),
  // Type space = {undefined (main rule: invalid state, override: inherit), date (set/override to date)} Release immediately is just Date().
  releaseDate: z.string().optional().describe('Deadline date as ISO String'),
  // Type space = {undefined (main rule: invalid state, override: inherit), date (set/override to date)}
  dueDate: z.string().optional().describe('Due date as ISO String'),
  // Type space = {undefined (main rule: no invalid state, override: inherit), array (earlyDeadlines present or empty (none)), null (main: invalid state, override: override and clear)}
  earlyDeadlines: z
    .array(DeadlineEntryJsonSchema)
    .nullable()
    .optional()
    .describe('Array of early deadlines with credit as percentages'),
  // Type space = {undefined (main rule: invalid state, override: inherit), array (lateDeadlines present or empty (none)), null (main: invalid state, override: override and clear)}
  lateDeadlines: z
    .array(DeadlineEntryJsonSchema)
    .nullable()
    .optional()
    .describe('Array of late deadlines with credit as percentages'),
  // Type space = {undefined (main rule: no afterLastDeadline, override: inherit), {allowSubmissions: bool, credit: number}}
  afterLastDeadline: AfterLastDeadlineJsonSchema.describe(
    'Controls for assessment behaviour after last deadline',
  ).optional(),
  // Type space = {undefined (main: invalid state, override: inherit), number (set/over to number), null (main: no time limit, override: override and clear to no time limit)}
  durationMinutes: z
    .number()
    .int()
    .positive()
    .nullable()
    .optional()
    .describe('Desired duration limit for assessment'),
  password: z.string().nullable().optional().describe('Password for assessment'),
});

const ExamJsonSchema = z.object({
  // Type Space = {defined}
  examUuid: z.string().describe('UUID of associated PrairieTest exam'),
  readOnly: z.boolean().optional().describe('Whether the exam is read-only for students'),
});

const PrairieTestControlJsonSchema = z.object({
  // enabled: z.boolean().optional().describe('Whether praireTestControl is enabled or not'),
  // Type space = {}
  exams: z.array(ExamJsonSchema).min(1).describe('Array of associated PrairieTest exam configs'),
});

const HideQuestionsDateControlJsonSchema = z.object({
  // Type space: {, defined :{set/override to value}, null: (main: invalid state, override: override and clear value (no showAgainDate))}
  // It is okay to mandate this value be set as it is necessarily true this this was undefined, then hideAgainDate must also be undefined, and thus HistQuestionDateControl in the parent object would also be undefined
  showAgainDate: z
    .string()
    .nullable()
    .describe(
      'Date as ISO String for when to unhide questions to students after assessment completion',
    ),
  // Precondition: Can only be set iff showAgainDate defined. If defined, must be after showAgainDate.
  // Type Space: {undefined: (main: no hideAgain date, override: inherit), defined: (set/override to value), null: (main: invalid state, override: override and clear value (no hideAgainDate))}
  hideAgainDate: z
    .string()
    .optional()
    .nullable()
    .describe(
      'Date as ISO String for when to rehide questions to students after assessment completion',
    ),
});

// const HideScoreDateControlJsonSchema = z.object({
//   showAgainDate: z
//     .string()
//     .optional()
//     .describe('Date as ISO String for when to reveal hidden scores after assessment completion'),
// });

const AfterCompleteJsonSchema = z.object({
  // Type space: {undefined: (main: invalid state, override: inherit), defined: (set/override to defined state)}
  hideQuestions: z
    .boolean()
    .optional()
    .describe(
      'Whether to enable settings controlling question visibility after assessment completion',
    ),
  // Precondition: Can only be set iff (hideQuestions == true)
  // Type space: {undefined: (main: if hideQuestion == false, vacuous. if hideQuestion == true, reshow and rehide by config, override: inherit), null: (main: invalid state, override: override and clear (as if it was undefined)), defined: (set/override to defined state)}
  // Should never be an empty object
  hideQuestionsDateControl: HideQuestionsDateControlJsonSchema.describe(
    'Settings controlling question visibility after assessment completion',
  )
    .optional()
    .nullable(),
  // Type space: {undefined: (main: invalid state, override: inherit), defined: (set/override to defined state)}
  hideScore: z
    .boolean()
    .optional()
    .describe(
      'Whether to enable settings controlling score visibility after assessment completion',
    ),
  // Precondition: Can only be set iff (hideScore == true)
  // Type space: {undefined: (main: if hideScore == false, vacuous. if hideScore == true, show again on date., override: inherit), null: (main: invalid state, override: override and clear (as if it was undefined)), defined: (set/override to defined state)}
  hideScoreShowAgainDate: z
    .string()
    .optional()
    .nullable()
    .describe('Date as ISO String for when to reveal hidden scores after assessment completion'),
});

/*
Originally we 


*/

export const AccessControlJsonSchema = z.object({
  name: z.string().optional().describe('Name for AccessControl rule'),
  // Type space: undefined -> assignment level, defined -> target for override
  targets: z
    .array(z.string())
    .optional()
    .describe('Array of (User, Access Control Group) ids this set targets'),
  // Type space: {defined: (set to checkbox value)}
  enabled: z.boolean().describe('Whether this set of permissions is enabled'),
  // Type space: {defined: (set to checkbox value)}
  blockAccess: z
    .boolean()
    .nullable()
    .describe('Short circuit for whether the targets should have access to the assessment'),

  // Type space: {defined: (set/override value), undefined: (main: invalid state, override: inherit (impilicit because we don't allow overriding of this value))}
  listBeforeRelease: z
    .boolean()
    .optional()
    .describe('Whether students can see the title and click into the assessment before release'),

  // Type space: {defined: (set/override dateControl), undefined: (main: invalid state, override: inherit all of dateControl)}
  dateControl: DateControlJsonSchema.optional(),
  // Type space: {undefined: no PT controls, {exams: [array of at least one]}}. Cannot be override and thus has no override value space.
  prairieTestControl: PrairieTestControlJsonSchema.optional(),
  // Type space: {undefined: (main: invalid state as minimal state is {hideQuestions: false, hideScore: false}, override: inherit), defined: (set/override to defined state)}
  afterComplete: AfterCompleteJsonSchema.optional(),
});

export type AccessControlJson = z.infer<typeof AccessControlJsonSchema>;
export type AccessControlJsonInput = z.input<typeof AccessControlJsonSchema>;
