import { z } from 'zod';

import { DatetimeLocalStringSchema } from '@prairielearn/zod';

/**
 * Maximum number of access control rules (main + overrides) per assessment.
 * Enforced during both JSON sync and tRPC input validation.
 */
export const MAX_ACCESS_CONTROL_RULES = 50;

/**
 * Maximum number of enrollment-targeted access control rules per assessment.
 * Enrollment rules are per-student overrides, so a lower limit is appropriate.
 */
export const MAX_ENROLLMENT_RULES = 100;

export const DeadlineEntryJsonSchema = z
  .object({
    date: DatetimeLocalStringSchema.describe('Date as ISO String for additional deadline'),
    credit: z.number().min(0).describe('Amount of credit as a percent to allow'),
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

/**
 * Validates date ordering within a single access control rule.
 * Returns an array of error messages (empty if valid).
 */
export function validateRuleDateOrdering(rule: AccessControlJson): string[] {
  const errors: string[] = [];
  const dc = rule.dateControl;

  if (dc) {
    const releaseMs = dc.releaseDate ? new Date(dc.releaseDate).getTime() : null;
    const dueMs = dc.dueDate ? new Date(dc.dueDate).getTime() : null;

    if (releaseMs != null && dueMs != null && releaseMs >= dueMs) {
      errors.push('Release date must be before due date.');
    }

    if (dueMs != null && dc.earlyDeadlines) {
      for (const d of dc.earlyDeadlines) {
        if (new Date(d.date).getTime() >= dueMs) {
          errors.push(`Early deadline date ${d.date} must be before the due date.`);
        }
      }
    }

    if (dueMs != null && dc.lateDeadlines) {
      for (const d of dc.lateDeadlines) {
        if (new Date(d.date).getTime() <= dueMs) {
          errors.push(`Late deadline date ${d.date} must be after the due date.`);
        }
      }
    }

    if (dc.earlyDeadlines && dc.earlyDeadlines.length > 1) {
      for (let i = 1; i < dc.earlyDeadlines.length; i++) {
        if (
          new Date(dc.earlyDeadlines[i].date).getTime() <
          new Date(dc.earlyDeadlines[i - 1].date).getTime()
        ) {
          errors.push('Early deadlines must be in chronological order.');
          break;
        }
      }
    }

    if (dc.lateDeadlines && dc.lateDeadlines.length > 1) {
      for (let i = 1; i < dc.lateDeadlines.length; i++) {
        if (
          new Date(dc.lateDeadlines[i].date).getTime() <
          new Date(dc.lateDeadlines[i - 1].date).getTime()
        ) {
          errors.push('Late deadlines must be in chronological order.');
          break;
        }
      }
    }
  }

  const ac = rule.afterComplete;
  if (ac?.showQuestionsAgainDate && ac.hideQuestionsAgainDate) {
    if (
      new Date(ac.showQuestionsAgainDate).getTime() >= new Date(ac.hideQuestionsAgainDate).getTime()
    ) {
      errors.push('showQuestionsAgainDate must be before hideQuestionsAgainDate.');
    }
  }

  return errors;
}

/**
 * Validates credit monotonicity within a single access control rule.
 * Returns an array of error messages (empty if valid).
 */
export function validateRuleCreditMonotonicity(rule: AccessControlJson): string[] {
  const errors: string[] = [];
  const dc = rule.dateControl;
  if (!dc) return errors;

  if (dc.earlyDeadlines) {
    for (const d of dc.earlyDeadlines) {
      if (d.credit < 100) {
        errors.push(`Early deadline credit must be at least 100%, got ${d.credit}%.`);
        break;
      }
    }
  }

  if (dc.earlyDeadlines && dc.earlyDeadlines.length > 1) {
    for (let i = 1; i < dc.earlyDeadlines.length; i++) {
      if (dc.earlyDeadlines[i].credit > dc.earlyDeadlines[i - 1].credit) {
        errors.push('Early deadline credits must be monotonically decreasing.');
        break;
      }
    }
  }

  if (dc.lateDeadlines) {
    for (const d of dc.lateDeadlines) {
      if (d.credit >= 100) {
        errors.push(`Late deadline credit must be less than 100%, got ${d.credit}%.`);
        break;
      }
    }
  }

  if (dc.lateDeadlines && dc.lateDeadlines.length > 1) {
    for (let i = 1; i < dc.lateDeadlines.length; i++) {
      if (dc.lateDeadlines[i].credit > dc.lateDeadlines[i - 1].credit) {
        errors.push('Late deadline credits must be monotonically decreasing.');
        break;
      }
    }
  }

  return errors;
}
