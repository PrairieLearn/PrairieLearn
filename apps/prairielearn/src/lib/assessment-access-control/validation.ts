import type { AccessControlJson } from '../../schemas/accessControl.js';

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

function hasAnyDeadline(rule: AccessControlJson): boolean {
  const dc = rule.dateControl;
  if (!dc) return false;
  if (dc.dueDate) return true;
  if (dc.lateDeadlines && dc.lateDeadlines.length > 0) return true;
  return false;
}

/**
 * Validates structural field dependencies within a single rule.
 * These are constraints where certain fields are meaningless without
 * prerequisite fields being set.
 */
export function validateRuleStructuralDependencyIssues(
  validationRule: AccessControlValidationRule,
): AccessControlValidationIssue[] {
  const issues: AccessControlValidationIssue[] = [];
  const rule = validationRule.rule;
  const dc = rule.dateControl;

  // Constraint 1: Late deadlines require a due date.
  // Late deadlines define credit after the due date, so they need one as an anchor.
  // Early deadlines are standalone bonus-credit windows and don't need a due date.
  // On overrides, dueDate === undefined means "inherit from main rule" (valid),
  // while dueDate === null means "explicitly no due date" (invalid with late deadlines).
  if (dc) {
    const dueDateMissing = validationRule.targetType === 'none' ? !dc.dueDate : dc.dueDate === null;

    if (dc.lateDeadlines && dc.lateDeadlines.length > 0 && dueDateMissing) {
      pushIssue(
        issues,
        validationRule,
        ['dateControl', 'lateDeadlines', 0, 'date'],
        'Late deadlines require a due date.',
      );
    }
  }

  // Constraint 2: After-complete date fields require at least one deadline.
  // The date fields (showQuestionsAgainDate, hideQuestionsAgainDate,
  // showScoreAgainDate) are meant to fire relative to the last deadline.
  // Boolean fields (hideQuestions, hideScore) are fine without deadlines.
  // PrairieTest and timed assessments manage completion independently,
  // so after-complete dates are valid without deadlines in those cases.
  // Only enforced on the main rule — overrides may inherit deadlines.
  const hasPrairieTest = (rule.integrations?.prairieTest?.exams ?? []).length > 0;
  const hasDuration = dc?.durationMinutes != null;
  const ac = rule.afterComplete;
  if (
    validationRule.targetType === 'none' &&
    ac &&
    !hasAnyDeadline(rule) &&
    !hasPrairieTest &&
    !hasDuration
  ) {
    if (ac.showQuestionsAgainDate) {
      pushIssue(
        issues,
        validationRule,
        ['afterComplete', 'showQuestionsAgainDate'],
        'After-complete dates require at least one deadline (due date or late deadline).',
      );
    }
    if (ac.hideQuestionsAgainDate) {
      pushIssue(
        issues,
        validationRule,
        ['afterComplete', 'hideQuestionsAgainDate'],
        'After-complete dates require at least one deadline (due date or late deadline).',
      );
    }
    if (ac.showScoreAgainDate) {
      pushIssue(
        issues,
        validationRule,
        ['afterComplete', 'showScoreAgainDate'],
        'After-complete dates require at least one deadline (due date or late deadline).',
      );
    }
  }

  return issues;
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

  const afterCredit = dc.afterLastDeadline?.credit;
  if (afterCredit != null) {
    // Determine the preceding credit in the timeline.
    const precedingCredit =
      dc.lateDeadlines?.at(-1)?.credit ?? (dc.dueDate != null ? 100 : undefined);

    if (precedingCredit != null && afterCredit > precedingCredit) {
      errors.push(
        `After-last-deadline credit (${afterCredit}%) must not exceed the preceding deadline's credit (${precedingCredit}%).`,
      );
    }
  }

  return errors;
}

/**
 * Validates a single access control rule. Checks duplicates, date ordering,
 * credit monotonicity, and target-type constraints (e.g. integrations and
 * listBeforeRelease are only valid on the main rule).
 *
 * @param rule The access control rule to validate.
 * @param targetType 'none' for the main rule, 'student_label' or 'enrollment' for overrides.
 */
export function validateRule(
  rule: AccessControlJson,
  targetType: 'none' | 'student_label' | 'enrollment',
): string[] {
  const errors: string[] = [];

  if (targetType === 'none') {
    if (rule.dateControl && !rule.dateControl.releaseDate) {
      errors.push('Release date is required on the defaults when dateControl is specified.');
    }
  } else {
    if (rule.listBeforeRelease !== undefined) {
      errors.push('listBeforeRelease can only be specified on the defaults.');
    }
    if (rule.integrations != null) {
      errors.push('integrations can only be specified on the defaults.');
    }
  }

  const exams = rule.integrations?.prairieTest?.exams ?? [];
  const seenUuids = new Set<string>();
  for (const e of exams) {
    if (seenUuids.has(e.examUuid)) {
      errors.push(`Duplicate PrairieTest exam UUID: ${e.examUuid}.`);
    }
    seenUuids.add(e.examUuid);
  }

  const earlyDates = new Set<string>();
  for (const d of rule.dateControl?.earlyDeadlines ?? []) {
    if (earlyDates.has(d.date)) {
      errors.push(`Duplicate early deadline date: ${d.date}.`);
    }
    earlyDates.add(d.date);
  }

  const lateDates = new Set<string>();
  for (const d of rule.dateControl?.lateDeadlines ?? []) {
    if (lateDates.has(d.date)) {
      errors.push(`Duplicate late deadline date: ${d.date}.`);
    }
    lateDates.add(d.date);
  }

  errors.push(
    ...validateRuleStructuralDependencyIssues({
      rule,
      targetType,
      ruleIndex: 0,
    }).map((issue) => issue.message),
  );

  const dateErrors = validateRuleDateOrdering(rule);
  errors.push(...dateErrors);
  // Credit monotonicity assumes deadlines are chronological; skip if dates
  // are out of order to avoid misleading "not monotonically decreasing" errors.
  if (dateErrors.length === 0) {
    errors.push(...validateRuleCreditMonotonicity(rule));
  }

  return errors;
}

function formatValues(values: Set<string> | string[]) {
  return Array.from(values)
    .map((v) => `"${v}"`)
    .join(', ');
}

/**
 * Validates an array of access control rules.
 * Returns a single object with all accumulated errors and warnings.
 *
 * @param params
 * @param params.rules The full ordered list of access control rules: index 0 is the
 * main (defaults) rule that applies to everyone (no labels), and all
 * subsequent entries are student-label rules that target specific labels.
 * @param params.enrollmentRules Optional separate list of enrollment-based rules.
 * @param params.validStudentLabelNames Optional set of known student label names for
 * cross-referencing validation.
 */
export function validateAccessControlRules({
  rules,
  enrollmentRules,
  validStudentLabelNames,
}: {
  rules: AccessControlJson[];
  enrollmentRules?: AccessControlJson[];
  validStudentLabelNames?: Set<string>;
}): { warnings: string[]; errors: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const validationRules: AccessControlValidationRule[] = [];
  const enrollmentRulesCount = enrollmentRules?.length ?? 0;

  // If the feature is completely unused, we can skip all validation and we don't need a default rule.
  if (rules.length === 0 && enrollmentRulesCount === 0) {
    return { errors, warnings };
  }

  if (rules.length > MAX_ACCESS_CONTROL_RULES) {
    errors.push(
      `Too many access control rules: ${rules.length}. Maximum allowed is ${MAX_ACCESS_CONTROL_RULES}.`,
    );
  }

  // A main rule has no `labels` property (applies to everyone)
  const mainRules = rules.filter((rule) => rule.labels == null || rule.labels.length === 0);

  if (mainRules.length === 0) {
    errors.push('No defaults found. The first element of accessControl must apply to everyone.');
  } else if (mainRules.length > 1) {
    errors.push(
      `Found ${mainRules.length} defaults entries. Only one element of accessControl should apply to everyone.`,
    );
  } else {
    // The DB constraint `check_first_rule_is_none` requires the main rule at index 0
    const firstRule = rules[0];
    const isFirstRuleMain = firstRule.labels == null || firstRule.labels.length === 0;
    if (!isFirstRuleMain) {
      errors.push('The defaults must be the first element in the array.');
    }
  }

  // Index 0 is the main rule; everything else is a student-label rule.
  rules.forEach((rule, index) => {
    const targetType: AccessControlRuleTargetType = index === 0 ? 'none' : 'student_label';

    const labels = rule.labels ?? [];
    const seenLabels = new Set<string>();
    const duplicateLabels = new Set<string>();

    for (const label of labels) {
      if (seenLabels.has(label)) {
        duplicateLabels.add(label);
      } else {
        seenLabels.add(label);
      }
    }

    if (duplicateLabels.size > 0) {
      errors.push(
        `Found duplicate student labels in this access control rule: ${formatValues(duplicateLabels)}.`,
      );
    }

    if (validStudentLabelNames !== undefined) {
      const invalidLabels = [...seenLabels].filter((label) => !validStudentLabelNames.has(label));
      if (invalidLabels.length > 0) {
        errors.push(
          `The access control rule targets non-existent student labels: ${formatValues(invalidLabels)}.`,
        );
      }
    }

    validationRules.push({
      rule,
      targetType,
      ruleIndex: validationRules.length,
    });

    errors.push(...validateRule(rule, targetType));
  });

  for (const rule of enrollmentRules ?? []) {
    validationRules.push({
      rule,
      targetType: 'enrollment',
      ruleIndex: validationRules.length,
    });
    errors.push(...validateRule(rule, 'enrollment'));
  }

  errors.push(
    ...validateGlobalDateConsistencyIssues(validationRules).map((issue) => issue.message),
  );

  return { errors, warnings };
}
