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

export type AccessControlRuleTargetType = 'none' | 'student_label' | 'enrollment';

export interface AccessControlValidationRule {
  rule: AccessControlJson;
  targetType: AccessControlRuleTargetType;
  ruleIndex: number;
}

export type AccessControlIssuePath =
  | ['dateControl', 'releaseDate']
  | ['dateControl', 'dueDate']
  | ['dateControl', 'earlyDeadlines', number, 'date']
  | ['dateControl', 'lateDeadlines', number, 'date']
  | ['afterComplete', 'showQuestionsAgainDate']
  | ['afterComplete', 'hideQuestionsAgainDate']
  | ['afterComplete', 'showScoreAgainDate'];

export interface AccessControlValidationIssue {
  ruleIndex: number;
  targetType: AccessControlRuleTargetType;
  path: AccessControlIssuePath;
  message: string;
}

function pushIssue(
  issues: AccessControlValidationIssue[],
  validationRule: AccessControlValidationRule,
  path: AccessControlIssuePath,
  message: string,
) {
  issues.push({
    ruleIndex: validationRule.ruleIndex,
    targetType: validationRule.targetType,
    path,
    message,
  });
}

function findReleaseMs(rule: AccessControlJson): number | null {
  return rule.dateControl?.releaseDate ? new Date(rule.dateControl.releaseDate).getTime() : null;
}

function findDueMs(rule: AccessControlJson): number | null {
  return rule.dateControl?.dueDate ? new Date(rule.dateControl.dueDate).getTime() : null;
}

function findDueState(rule: AccessControlJson): {
  hasConfiguredDue: boolean;
  dueMs: number | null;
} {
  const dateControl = rule.dateControl;
  if (dateControl?.dueDate === undefined) {
    return { hasConfiguredDue: false, dueMs: null };
  }
  return {
    hasConfiguredDue: true,
    dueMs: dateControl.dueDate ? new Date(dateControl.dueDate).getTime() : null,
  };
}

function findLastDeadlineMs(rule: AccessControlJson): number | null {
  const dc = rule.dateControl;
  if (!dc) return null;

  if (dc.lateDeadlines && dc.lateDeadlines.length > 0) {
    return new Date(dc.lateDeadlines[dc.lateDeadlines.length - 1].date).getTime();
  }
  return findDueMs(rule);
}

export function validateRuleDateOrderingIssues(
  validationRule: AccessControlValidationRule,
): AccessControlValidationIssue[] {
  const issues: AccessControlValidationIssue[] = [];
  const rule = validationRule.rule;
  const dc = rule.dateControl;

  if (dc) {
    const releaseMs = findReleaseMs(rule);
    const dueMs = findDueMs(rule);

    if (releaseMs != null && dueMs != null && releaseMs >= dueMs) {
      pushIssue(
        issues,
        validationRule,
        ['dateControl', 'dueDate'],
        'Release date must be before due date.',
      );
    }

    if (releaseMs != null && dc.earlyDeadlines) {
      for (const [index, deadline] of dc.earlyDeadlines.entries()) {
        if (new Date(deadline.date).getTime() <= releaseMs) {
          pushIssue(
            issues,
            validationRule,
            ['dateControl', 'earlyDeadlines', index, 'date'],
            `Early deadline date ${deadline.date} must be after the release date.`,
          );
        }
      }
    }

    if (releaseMs != null && dc.lateDeadlines) {
      for (const [index, deadline] of dc.lateDeadlines.entries()) {
        if (new Date(deadline.date).getTime() <= releaseMs) {
          pushIssue(
            issues,
            validationRule,
            ['dateControl', 'lateDeadlines', index, 'date'],
            `Late deadline date ${deadline.date} must be after the release date.`,
          );
        }
      }
    }

    if (dueMs != null && dc.earlyDeadlines) {
      for (const [index, deadline] of dc.earlyDeadlines.entries()) {
        if (new Date(deadline.date).getTime() >= dueMs) {
          pushIssue(
            issues,
            validationRule,
            ['dateControl', 'earlyDeadlines', index, 'date'],
            `Early deadline date ${deadline.date} must be before the due date.`,
          );
        }
      }
    }

    if (dueMs != null && dc.lateDeadlines) {
      for (const [index, deadline] of dc.lateDeadlines.entries()) {
        if (new Date(deadline.date).getTime() <= dueMs) {
          pushIssue(
            issues,
            validationRule,
            ['dateControl', 'lateDeadlines', index, 'date'],
            `Late deadline date ${deadline.date} must be after the due date.`,
          );
        }
      }
    }

    if (dc.earlyDeadlines && dc.earlyDeadlines.length > 1) {
      for (let i = 1; i < dc.earlyDeadlines.length; i++) {
        if (
          new Date(dc.earlyDeadlines[i].date).getTime() <
          new Date(dc.earlyDeadlines[i - 1].date).getTime()
        ) {
          pushIssue(
            issues,
            validationRule,
            ['dateControl', 'earlyDeadlines', i, 'date'],
            'Early deadlines must be in chronological order.',
          );
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
          pushIssue(
            issues,
            validationRule,
            ['dateControl', 'lateDeadlines', i, 'date'],
            'Late deadlines must be in chronological order.',
          );
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
      pushIssue(
        issues,
        validationRule,
        ['afterComplete', 'hideQuestionsAgainDate'],
        'showQuestionsAgainDate must be before hideQuestionsAgainDate.',
      );
    }
  }

  const lastDeadlineMs = findLastDeadlineMs(rule);
  if (lastDeadlineMs != null) {
    if (ac?.showQuestionsAgainDate) {
      if (new Date(ac.showQuestionsAgainDate).getTime() <= lastDeadlineMs) {
        pushIssue(
          issues,
          validationRule,
          ['afterComplete', 'showQuestionsAgainDate'],
          'Show questions again date must be after the last deadline.',
        );
      }
    }
    if (ac?.showScoreAgainDate) {
      if (new Date(ac.showScoreAgainDate).getTime() <= lastDeadlineMs) {
        pushIssue(
          issues,
          validationRule,
          ['afterComplete', 'showScoreAgainDate'],
          'Show score again date must be after the last deadline.',
        );
      }
    }
  }

  return issues;
}

export function validateGlobalDateConsistencyIssues(
  validationRules: AccessControlValidationRule[],
): AccessControlValidationIssue[] {
  const issues: AccessControlValidationIssue[] = [];
  if (validationRules.length === 0) return issues;

  // This is intentionally a coarse global check. We collapse the candidate
  // rules down to lenient bounds that any merged timeline must satisfy:
  // earliest release, earliest configured due, and latest configured due.
  // That catches obviously impossible combinations without trying to model
  // every exact target/override interaction here.
  const releaseTimes = validationRules
    .map(({ rule }) => findReleaseMs(rule))
    .filter((releaseMs): releaseMs is number => releaseMs != null);
  const dueStates = validationRules.map(({ rule }) => findDueState(rule));
  const configuredDueTimes = dueStates
    .map(({ dueMs }) => dueMs)
    .filter((dueMs): dueMs is number => dueMs != null);

  const minReleaseMs = releaseTimes.length > 0 ? Math.min(...releaseTimes) : null;
  const minDueMs = configuredDueTimes.length > 0 ? Math.min(...configuredDueTimes) : null;
  const maxDueMs = configuredDueTimes.length > 0 ? Math.max(...configuredDueTimes) : null;
  const dueCanBeUnset = dueStates.some(
    ({ hasConfiguredDue, dueMs }) => hasConfiguredDue && dueMs == null,
  );

  for (const validationRule of validationRules) {
    const dueMs = findDueMs(validationRule.rule);

    if (minReleaseMs != null && dueMs != null && dueMs <= minReleaseMs) {
      pushIssue(
        issues,
        validationRule,
        ['dateControl', 'dueDate'],
        'Due date must be after the earliest possible release date.',
      );
    }

    for (const [index, deadline] of (
      validationRule.rule.dateControl?.earlyDeadlines ?? []
    ).entries()) {
      const deadlineMs = new Date(deadline.date).getTime();

      if (minReleaseMs != null && deadlineMs <= minReleaseMs) {
        pushIssue(
          issues,
          validationRule,
          ['dateControl', 'earlyDeadlines', index, 'date'],
          'Early deadline must be after the earliest possible release date.',
        );
      }

      if (!dueCanBeUnset && maxDueMs != null && deadlineMs >= maxDueMs) {
        pushIssue(
          issues,
          validationRule,
          ['dateControl', 'earlyDeadlines', index, 'date'],
          'Early deadline must be before the latest possible due date.',
        );
      }
    }

    for (const [index, deadline] of (
      validationRule.rule.dateControl?.lateDeadlines ?? []
    ).entries()) {
      const deadlineMs = new Date(deadline.date).getTime();

      if (!dueCanBeUnset && minDueMs != null && deadlineMs <= minDueMs) {
        pushIssue(
          issues,
          validationRule,
          ['dateControl', 'lateDeadlines', index, 'date'],
          'Late deadline must be after the earliest possible due date.',
        );
      }
    }
  }

  return issues;
}

/**
 * Validates date ordering within a single access control rule.
 * Returns an array of error messages (empty if valid).
 */
export function validateRuleDateOrdering(rule: AccessControlJson): string[] {
  return validateRuleDateOrderingIssues({
    rule,
    targetType: 'none',
    ruleIndex: 0,
  }).map((issue) => issue.message);
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
      if (d.credit < 101 || d.credit > 200) {
        errors.push(`Early deadline credit must be between 101% and 200%, got ${d.credit}%.`);
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
      if (d.credit < 0 || d.credit > 99) {
        errors.push(`Late deadline credit must be between 0% and 99%, got ${d.credit}%.`);
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
