import type { AccessControlJson } from '../../schemas/accessControl.js';

/**
 * Maximum number of access control rules (default + overrides) per assessment.
 * Enforced during both JSON sync and tRPC input validation.
 */
export const MAX_ACCESS_CONTROL_RULES = 50;

/**
 * Maximum number of enrollment-targeted access control rules per assessment.
 * Enrollment rules are per-student overrides, so a lower limit is appropriate.
 */
export const MAX_ENROLLMENT_RULES = 100;

type AccessControlRuleTargetType = 'none' | 'student_label' | 'enrollment';

export interface AccessControlValidationRule {
  rule: AccessControlJson;
  targetType: AccessControlRuleTargetType;
  ruleIndex: number;
}

type AccessControlIssuePath =
  | ['dateControl', 'release', 'date']
  | ['dateControl', 'due', 'date']
  | ['dateControl', 'due', 'credit']
  | ['dateControl', 'earlyDeadlines', number, 'date']
  | ['dateControl', 'earlyDeadlines', number, 'credit']
  | ['dateControl', 'lateDeadlines', number, 'date']
  | ['dateControl', 'lateDeadlines', number, 'credit']
  | ['dateControl', 'afterLastDeadline', 'credit']
  | ['afterComplete', 'questions']
  | ['afterComplete', 'questions', 'visibleFromDate']
  | ['afterComplete', 'questions', 'visibleUntilDate']
  | ['afterComplete', 'score']
  | ['afterComplete', 'score', 'visibleFromDate'];

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
  const releaseDate = rule.dateControl?.release?.date;
  return releaseDate ? new Date(releaseDate).getTime() : null;
}

function findDueMs(rule: AccessControlJson): number | null {
  return rule.dateControl?.due?.date ? new Date(rule.dateControl.due.date).getTime() : null;
}

function findDueState(rule: AccessControlJson): {
  hasConfiguredDue: boolean;
  dueMs: number | null;
  dueCredit: number;
  hasCustomCredit: boolean;
} {
  const dateControl = rule.dateControl;
  if (dateControl?.due === undefined) {
    return { hasConfiguredDue: false, dueMs: null, dueCredit: 100, hasCustomCredit: false };
  }
  return {
    hasConfiguredDue: true,
    dueMs: dateControl.due.date ? new Date(dateControl.due.date).getTime() : null,
    dueCredit: dateControl.due.credit ?? 100,
    hasCustomCredit: dateControl.due.credit !== undefined,
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
  if (dc.due?.date) return true;
  if (dc.lateDeadlines && dc.lateDeadlines.length > 0) return true;
  return false;
}

type CompletionMechanismType = 'deadline' | 'duration' | 'prairieTest';

function getCompletionMechanismTypes(rule: AccessControlJson): Set<CompletionMechanismType> {
  const types = new Set<CompletionMechanismType>();
  if (hasAnyDeadline(rule)) types.add('deadline');
  if (rule.dateControl?.durationMinutes != null) types.add('duration');
  if ((rule.integrations?.prairieTest?.exams ?? []).length > 0) types.add('prairieTest');
  return types;
}

/**
 * Mechanism types that an override actively clears, i.e. nulls out without
 * supplying a replacement. Used to pull a globally-available mechanism out
 * of consideration for this override's resolved view: e.g. a default with only
 * a due date paired with an override of `dateControl: { due: { date: null } }`
 * leaves the override's students with nothing. Overrides cannot define
 * `integrations`, so PrairieTest exams cannot be cleared by an override.
 */
function overrideClearedMechanismTypes(rule: AccessControlJson): Set<CompletionMechanismType> {
  const cleared = new Set<CompletionMechanismType>();
  const dc = rule.dateControl;
  if (!dc) return cleared;
  if (!hasAnyDeadline(rule) && dc.due !== undefined && dc.due.date == null) {
    cleared.add('deadline');
  }
  if (dc.durationMinutes === null) {
    cleared.add('duration');
  }
  return cleared;
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

  // Constraint 1: Late deadlines and afterLastDeadline (when allowSubmissions:
  // true) need a due date as an anchor. Early deadlines are standalone bonus
  // windows. The cross-rule "inherit from default" case is handled by
  // `validateGlobalStructuralDependencyIssues`.
  if (dc) {
    const dueDateMissing =
      validationRule.targetType === 'none' ? !dc.due?.date : dc.due?.date === null;

    if (dueDateMissing) {
      if (dc.lateDeadlines && dc.lateDeadlines.length > 0) {
        pushIssue(
          issues,
          validationRule,
          ['dateControl', 'lateDeadlines', 0, 'date'],
          'Late deadlines require a due date.',
        );
      }

      if (dc.afterLastDeadline?.allowSubmissions === true) {
        pushIssue(
          issues,
          validationRule,
          ['dateControl', 'afterLastDeadline', 'credit'],
          'After-last-deadline behavior requires a due date.',
        );
      }
    }
  }

  // Constraint 2: Early deadlines are not allowed when due-date credit is
  // below 100%. In that shape the due date is already the first below-full
  // credit deadline, so there is no valid before-due deadline segment.
  if ((dc?.due?.credit ?? 100) < 100 && dc?.earlyDeadlines && dc.earlyDeadlines.length > 0) {
    pushIssue(
      issues,
      validationRule,
      ['dateControl', 'earlyDeadlines', 0, 'date'],
      'Early deadlines are not allowed when due date credit is below 100%.',
    );
  }

  // Constraint 3: After-complete date fields require at least one deadline.
  // The date fields (visibleFromDate, visibleUntilDate) are meant to fire relative
  // to the last deadline. Boolean fields (hidden) are fine without deadlines.
  // PrairieTest and timed assessments manage completion independently,
  // so after-complete dates are valid without deadlines in those cases.
  // Only enforced on the default rule — overrides may inherit deadlines.
  // The "no completion mechanism at all" case (no dateControl + no
  // PrairieTest) is handled by validateGlobalAfterCompleteIssues with a
  // broader message.
  const hasPrairieTest = (rule.integrations?.prairieTest?.exams ?? []).length > 0;
  const hasDuration = dc?.durationMinutes != null;
  const ac = rule.afterComplete;
  if (
    validationRule.targetType === 'none' &&
    ac &&
    dc &&
    !hasAnyDeadline(rule) &&
    !hasPrairieTest &&
    !hasDuration
  ) {
    const q = ac.questions;
    if (q?.visibleFromDate) {
      pushIssue(
        issues,
        validationRule,
        ['afterComplete', 'questions', 'visibleFromDate'],
        'After-complete dates require at least one deadline (due date or late deadline).',
      );
    }
    if (q?.visibleUntilDate) {
      pushIssue(
        issues,
        validationRule,
        ['afterComplete', 'questions', 'visibleUntilDate'],
        'After-complete dates require at least one deadline (due date or late deadline).',
      );
    }
    if (ac.score?.visibleFromDate) {
      pushIssue(
        issues,
        validationRule,
        ['afterComplete', 'score', 'visibleFromDate'],
        'After-complete dates require at least one deadline (due date or late deadline).',
      );
    }
  }

  return issues;
}

/**
 * Cross-rule structural check: complements the per-rule validator, which
 * treats `dc.due === undefined` on overrides as "inherit from default" and so
 * misses the case where the inherited value is also missing. Lenient like
 * the other global checks — overrides can cascade, so any rule's due could
 * anchor a given student's resolved timeline. Skips overrides that
 * explicitly set their own `due`: either it provides an anchor, or per-rule
 * already flagged the explicit-null case.
 */
export function validateGlobalStructuralDependencyIssues(
  validationRules: AccessControlValidationRule[],
): AccessControlValidationIssue[] {
  const issues: AccessControlValidationIssue[] = [];
  if (validationRules.length === 0) return issues;
  if (validationRules.some(({ rule }) => findDueMs(rule) != null)) return issues;

  for (const validationRule of validationRules) {
    if (validationRule.targetType === 'none') continue;
    const dc = validationRule.rule.dateControl;
    if (!dc || dc.due !== undefined) continue;

    if (dc.lateDeadlines && dc.lateDeadlines.length > 0) {
      pushIssue(
        issues,
        validationRule,
        ['dateControl', 'lateDeadlines', 0, 'date'],
        'Late deadlines require a due date on at least one rule.',
      );
    }

    // `allowSubmissions: false` is a no-op without a deadline.
    if (dc.afterLastDeadline?.allowSubmissions === true) {
      pushIssue(
        issues,
        validationRule,
        ['dateControl', 'afterLastDeadline', 'credit'],
        'After-last-deadline behavior requires a due date on at least one rule.',
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
        ['dateControl', 'due', 'date'],
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
        if (new Date(deadline.date).getTime() > dueMs) {
          pushIssue(
            issues,
            validationRule,
            ['dateControl', 'earlyDeadlines', index, 'date'],
            `Early deadline date ${deadline.date} must be on or before the due date.`,
          );
        }
      }
    }

    if (dueMs != null && dc.lateDeadlines) {
      for (const [index, deadline] of dc.lateDeadlines.entries()) {
        if (new Date(deadline.date).getTime() < dueMs) {
          pushIssue(
            issues,
            validationRule,
            ['dateControl', 'lateDeadlines', index, 'date'],
            `Late deadline date ${deadline.date} must be on or after the due date.`,
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

  const questions = rule.afterComplete?.questions;
  const qVisibleFrom = questions?.visibleFromDate;
  const qVisibleUntil = questions?.visibleUntilDate;
  if (qVisibleFrom && qVisibleUntil) {
    if (new Date(qVisibleFrom).getTime() >= new Date(qVisibleUntil).getTime()) {
      pushIssue(
        issues,
        validationRule,
        ['afterComplete', 'questions', 'visibleUntilDate'],
        'visibleFromDate must be before visibleUntilDate.',
      );
    }
  }

  const lastDeadlineMs = findLastDeadlineMs(rule);
  if (lastDeadlineMs != null) {
    if (qVisibleFrom) {
      if (new Date(qVisibleFrom).getTime() <= lastDeadlineMs) {
        pushIssue(
          issues,
          validationRule,
          ['afterComplete', 'questions', 'visibleFromDate'],
          'Show questions again date must be after the last deadline.',
        );
      }
    }
    const score = rule.afterComplete?.score;
    if (score?.visibleFromDate) {
      if (new Date(score.visibleFromDate).getTime() <= lastDeadlineMs) {
        pushIssue(
          issues,
          validationRule,
          ['afterComplete', 'score', 'visibleFromDate'],
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
        ['dateControl', 'due', 'date'],
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

      if (!dueCanBeUnset && maxDueMs != null && deadlineMs > maxDueMs) {
        pushIssue(
          issues,
          validationRule,
          ['dateControl', 'earlyDeadlines', index, 'date'],
          'Early deadline must be on or before the latest possible due date.',
        );
      }
    }

    for (const [index, deadline] of (
      validationRule.rule.dateControl?.lateDeadlines ?? []
    ).entries()) {
      const deadlineMs = new Date(deadline.date).getTime();

      if (!dueCanBeUnset && minDueMs != null && deadlineMs < minDueMs) {
        pushIssue(
          issues,
          validationRule,
          ['dateControl', 'lateDeadlines', index, 'date'],
          'Late deadline must be on or after the earliest possible due date.',
        );
      }
    }
  }

  return issues;
}

/**
 * Cross-rule credit consistency checks.
 *
 * 1. Each override's effective deadline sequence, after inheriting default
 *    fields, must strictly decrease.
 */
export function validateGlobalCreditConsistencyIssues(
  validationRules: AccessControlValidationRule[],
): AccessControlValidationIssue[] {
  const issues: AccessControlValidationIssue[] = [];
  if (validationRules.length === 0) return issues;

  for (const [validationRuleIndex, validationRule] of validationRules.entries()) {
    if (validationRule.targetType === 'none') continue;

    const effectiveEntries = getEffectiveCreditEntries(validationRules, validationRuleIndex);

    const dueEntry = effectiveEntries.find((entry) => entry.kind === 'due');
    if (dueEntry && dueEntry.credit < 100) {
      const earlyEntry = effectiveEntries.find((entry) => entry.kind === 'earlyDeadline');
      const issueEntry = chooseEffectiveIssueEntry(validationRule, earlyEntry, dueEntry);
      if (earlyEntry && issueEntry) {
        pushIssue(
          issues,
          issueEntry.validationRule,
          issueEntry.path,
          'Early deadlines are not allowed when due date credit is below 100%.',
        );
      }
    }

    for (let i = 1; i < effectiveEntries.length; i++) {
      const previous = effectiveEntries[i - 1];
      const current = effectiveEntries[i];
      if (current.credit < previous.credit) continue;

      const issueEntry = chooseEffectiveIssueEntry(validationRule, current, previous);
      if (!issueEntry) continue;
      pushIssue(
        issues,
        issueEntry.validationRule,
        issueEntry.path,
        'Deadline credits must strictly decrease over time.',
      );
      break;
    }
  }

  return issues;
}

type CreditEntryKind = 'earlyDeadline' | 'due' | 'lateDeadline' | 'afterLastDeadline';

interface CreditEntry {
  kind: CreditEntryKind;
  credit: number;
  validationRule: AccessControlValidationRule;
  path: AccessControlIssuePath;
}

function getEffectiveCreditEntries(
  validationRules: AccessControlValidationRule[],
  validationRuleIndex: number,
): CreditEntry[] {
  const validationRule = validationRules[validationRuleIndex];
  const defaultValidationRule =
    validationRules.find((rule) => rule.targetType === 'none') ?? validationRules[0];
  const entries: CreditEntry[] = [];

  const sourceForField = <K extends keyof NonNullable<AccessControlJson['dateControl']>>(
    field: K,
  ): AccessControlValidationRule => {
    for (let i = validationRuleIndex; i >= 0; i--) {
      const sourceRule = validationRules[i];
      if (
        sourceRule.rule.dateControl?.[field] !== undefined &&
        couldCascadeToValidationRule(sourceRule, validationRule)
      ) {
        return sourceRule;
      }
    }
    return defaultValidationRule;
  };

  const earlySource = sourceForField('earlyDeadlines');
  for (const [index, deadline] of (earlySource.rule.dateControl?.earlyDeadlines ?? []).entries()) {
    entries.push({
      kind: 'earlyDeadline',
      credit: deadline.credit,
      validationRule: earlySource,
      path: ['dateControl', 'earlyDeadlines', index, 'credit'],
    });
  }

  const dueSource = sourceForField('due');
  const due = dueSource.rule.dateControl?.due;

  const lateSource = sourceForField('lateDeadlines');
  const lateDeadlines = lateSource.rule.dateControl?.lateDeadlines ?? [];

  const afterLastDeadlineSource = sourceForField('afterLastDeadline');
  const afterLastDeadline = afterLastDeadlineSource.rule.dateControl?.afterLastDeadline;

  const afterLastDeadlineHasCredit =
    afterLastDeadline?.allowSubmissions === true && afterLastDeadline.credit !== undefined;
  const afterLastDeadlineCredit = afterLastDeadlineHasCredit ? afterLastDeadline.credit : undefined;
  const needsImplicitDue =
    entries.length > 0 || lateDeadlines.length > 0 || afterLastDeadlineHasCredit;
  if (due !== undefined || needsImplicitDue) {
    entries.push({
      kind: 'due',
      credit: due?.credit ?? 100,
      validationRule: dueSource,
      path: ['dateControl', 'due', 'credit'],
    });
  }

  for (const [index, deadline] of lateDeadlines.entries()) {
    entries.push({
      kind: 'lateDeadline',
      credit: deadline.credit,
      validationRule: lateSource,
      path: ['dateControl', 'lateDeadlines', index, 'credit'],
    });
  }

  if (afterLastDeadlineCredit !== undefined) {
    entries.push({
      kind: 'afterLastDeadline',
      credit: afterLastDeadlineCredit,
      validationRule: afterLastDeadlineSource,
      path: ['dateControl', 'afterLastDeadline', 'credit'],
    });
  }

  return entries;
}

function couldCascadeToValidationRule(
  sourceRule: AccessControlValidationRule,
  validationRule: AccessControlValidationRule,
): boolean {
  if (sourceRule.targetType === 'none') return true;
  if (sourceRule === validationRule) return true;
  if (validationRule.targetType === 'student_label') {
    return (
      sourceRule.targetType === 'student_label' &&
      labelsOverlap(sourceRule.rule.labels, validationRule.rule.labels)
    );
  }
  // Enrollment rules also cascade after matching student-label rules at
  // runtime, but this rule-only validator does not know which labels the
  // target enrollments have. Treating every label rule as applicable creates
  // false positives, so enrollment checks are limited to defaults and the
  // enrollment rule itself here.
  return false;
}

function labelsOverlap(a: string[] | undefined, b: string[] | undefined): boolean {
  if (!a || !b) return false;
  return a.some((label) => b.includes(label));
}

function chooseEffectiveIssueEntry(
  currentValidationRule: AccessControlValidationRule,
  preferredEntry: CreditEntry | undefined,
  fallbackEntry: CreditEntry | undefined,
): CreditEntry | null {
  if (
    preferredEntry?.validationRule === currentValidationRule &&
    fallbackEntry?.validationRule === currentValidationRule
  ) {
    return null;
  }
  if (preferredEntry?.validationRule === currentValidationRule) return preferredEntry;
  if (fallbackEntry?.validationRule === currentValidationRule) return fallbackEntry;
  return null;
}

/**
 * Cross-rule check: each rule with after-complete settings must have a
 * completion mechanism — a real deadline (due date or late deadline), a
 * duration limit, or a PrairieTest exam. A dateControl with only `release`,
 * `password`, or `due: { date: null }` is not enough since none of those can
 * ever close the assessment, so any after-complete settings would be a no-op.
 *
 * The default rule must carry a mechanism in its own config. Overrides accept
 * any globally-available mechanism (any rule may contribute, since overrides
 * stack at runtime), minus types this override actively clears: a globally
 * unique mechanism type that the override nulls out leaves nothing for the
 * override's students.
 */
export function validateGlobalAfterCompleteIssues(
  validationRules: AccessControlValidationRule[],
): AccessControlValidationIssue[] {
  const issues: AccessControlValidationIssue[] = [];
  if (validationRules.length === 0) return issues;

  const message =
    'After-complete settings require a deadline, duration limit, or PrairieTest exam.';

  const globalMechanisms = new Set<CompletionMechanismType>();
  for (const vr of validationRules) {
    for (const t of getCompletionMechanismTypes(vr.rule)) globalMechanisms.add(t);
  }

  for (const validationRule of validationRules) {
    const ac = validationRule.rule.afterComplete;
    if (!ac) continue;

    let hasMechanism: boolean;
    if (validationRule.targetType === 'none') {
      hasMechanism = getCompletionMechanismTypes(validationRule.rule).size > 0;
    } else {
      const cleared = overrideClearedMechanismTypes(validationRule.rule);
      hasMechanism = [...globalMechanisms].some((t) => !cleared.has(t));
    }
    if (hasMechanism) continue;

    if (ac.questions !== undefined) {
      pushIssue(issues, validationRule, ['afterComplete', 'questions'], message);
    }
    if (ac.score !== undefined) {
      pushIssue(issues, validationRule, ['afterComplete', 'score'], message);
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
export function validateRuleCreditMonotonicity(
  rule: AccessControlJson,
  targetType: AccessControlRuleTargetType = 'none',
): string[] {
  const errors: string[] = [];
  const dc = rule.dateControl;
  if (!dc) return errors;

  const dueCredit = dc.due?.credit ?? 100;

  const afterCredit =
    dc.afterLastDeadline?.allowSubmissions === true ? dc.afterLastDeadline.credit : undefined;

  const credits: number[] = [];
  for (const deadline of dc.earlyDeadlines ?? []) {
    credits.push(deadline.credit);
  }
  const hasLaterCredit = (dc.lateDeadlines?.length ?? 0) > 0 || afterCredit != null;
  if (
    dc.due !== undefined ||
    (targetType === 'none' && ((dc.earlyDeadlines?.length ?? 0) > 0 || hasLaterCredit))
  ) {
    credits.push(dueCredit);
  }
  for (const deadline of dc.lateDeadlines ?? []) {
    credits.push(deadline.credit);
  }
  if (afterCredit != null) {
    credits.push(afterCredit);
  }

  for (let i = 1; i < credits.length; i++) {
    if (credits[i] >= credits[i - 1]) {
      errors.push('Deadline credits must strictly decrease over time.');
      break;
    }
  }

  return errors;
}

/**
 * Validates a single access control rule. Checks duplicates, date ordering,
 * credit monotonicity, and target-type constraints (e.g. integrations and
 * beforeRelease are only valid on the default rule).
 *
 * @param rule The access control rule to validate.
 * @param targetType 'none' for the default rule, 'student_label' or 'enrollment' for overrides.
 */
export function validateRule(
  rule: AccessControlJson,
  targetType: 'none' | 'student_label' | 'enrollment',
): string[] {
  const errors: string[] = [];

  if (targetType === 'none') {
    if (rule.dateControl && !rule.dateControl.release) {
      errors.push('Release date is required on the defaults when dateControl is specified.');
    }
  } else {
    if (rule.beforeRelease !== undefined) {
      errors.push('beforeRelease can only be specified on the defaults.');
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

    if (
      e.readOnly === true &&
      (e.afterComplete?.questions?.hidden === true || e.afterComplete?.score?.hidden === true)
    ) {
      errors.push(
        `PrairieTest exam ${e.examUuid}: readOnly: true cannot be combined with afterComplete.questions.hidden: true or afterComplete.score.hidden: true (a readOnly reservation is a review environment).`,
      );
    }
    if (e.afterComplete?.score?.hidden === true && e.afterComplete.questions?.hidden !== true) {
      errors.push(
        `PrairieTest exam ${e.examUuid}: afterComplete.score.hidden: true requires afterComplete.questions.hidden: true.`,
      );
    }
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

  if (
    rule.dateControl?.afterLastDeadline?.allowSubmissions === false &&
    rule.dateControl.afterLastDeadline.credit !== undefined
  ) {
    errors.push('afterLastDeadline.credit cannot be set when allowSubmissions is false.');
  }

  if (
    rule.afterComplete?.questions?.hidden === false &&
    (rule.afterComplete.questions.visibleFromDate !== undefined ||
      rule.afterComplete.questions.visibleUntilDate !== undefined)
  ) {
    errors.push(
      'afterComplete.questions cannot have visibleFromDate or visibleUntilDate when hidden is false.',
    );
  }

  if (
    rule.afterComplete?.score?.hidden === false &&
    rule.afterComplete.score.visibleFromDate !== undefined
  ) {
    errors.push('afterComplete.score cannot have visibleFromDate when hidden is false.');
  }

  if (
    rule.afterComplete?.score?.hidden === true &&
    rule.afterComplete.questions?.hidden === false
  ) {
    errors.push('afterComplete.score.hidden: true requires afterComplete.questions.hidden: true.');
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
  // are out of order to avoid misleading "credits must strictly decrease" errors.
  if (dateErrors.length === 0) {
    errors.push(...validateRuleCreditMonotonicity(rule, targetType));
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
 * default rule that applies to everyone (no labels), and all
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

  // A default rule is identified by the absence of a `labels` key.
  const defaultRules = rules.filter((rule) => rule.labels == null);

  if (defaultRules.length === 0) {
    errors.push('No defaults found. The first element of accessControl must apply to everyone.');
  } else if (defaultRules.length > 1) {
    errors.push(
      `Found ${defaultRules.length} defaults entries. Only one element of accessControl should apply to everyone.`,
    );
  } else {
    // The DB constraint `check_first_rule_is_none` requires the default rule at index 0
    const firstRule = rules[0];
    if (firstRule.labels != null) {
      errors.push('The defaults must be the first element in the array.');
    }
  }

  // Index 0 is the default rule; everything else is a student-label rule.
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
    ...validateGlobalCreditConsistencyIssues(validationRules).map((issue) => issue.message),
    ...validateGlobalStructuralDependencyIssues(validationRules).map((issue) => issue.message),
    ...validateGlobalAfterCompleteIssues(validationRules).map((issue) => issue.message),
  );

  return { errors, warnings };
}
