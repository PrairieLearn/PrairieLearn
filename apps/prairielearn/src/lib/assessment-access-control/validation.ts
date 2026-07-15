import {
  type AccessControlJson,
  MAX_ENROLLMENT_ACCESS_CONTROL_RULES,
  MAX_STUDENT_LABEL_ACCESS_CONTROL_RULES,
} from '../../schemas/accessControl.js';

const POST_DUE_CREDIT_MESSAGE = 'Credit after the due date must be at most 100%.';

export type AccessControlRuleTargetType = 'none' | 'student_label' | 'enrollment';

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
} {
  const dateControl = rule.dateControl;
  if (dateControl?.due === undefined) {
    return { hasConfiguredDue: false, dueMs: null };
  }
  return {
    hasConfiguredDue: true,
    dueMs: dateControl.due.date ? new Date(dateControl.due.date).getTime() : null,
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
 * Checks each override's effective deadline sequence, after inheriting default
 * fields, for post-due credit at most 100% and decreasing credit, with one
 * equal-credit window allowed immediately after the due date.
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

    const postDueEntry = effectiveEntries.find(
      (entry) =>
        (entry.kind === 'lateDeadline' || entry.kind === 'afterLastDeadline') &&
        entry.credit > 100 &&
        entry.validationRule === validationRule,
    );
    if (postDueEntry) {
      pushIssue(issues, validationRule, postDueEntry.path, POST_DUE_CREDIT_MESSAGE);
    }

    for (let i = 1; i < effectiveEntries.length; i++) {
      const previous = effectiveEntries[i - 1];
      const current = effectiveEntries[i];
      if (isValidCreditTransition(previous, current)) {
        continue;
      }

      const issueEntry = chooseEffectiveIssueEntry(validationRule, current, previous);
      if (!issueEntry) continue;
      pushIssue(
        issues,
        issueEntry.validationRule,
        issueEntry.path,
        'Credit must strictly decrease over time.',
      );
    }
  }

  return issues;
}

type CreditEntryKind = 'earlyDeadline' | 'due' | 'lateDeadline' | 'afterLastDeadline';

/**
 * One credit-bearing point in a rule's deadline timeline. The list of entries
 * for a rule, in chronological order, is the model the credit validators
 * operate on: post-due credit must be at most 100%, credits must decrease
 * across the list, and the first post-due entry may equal the due credit.
 * `validationRule` records which rule supplied the entry — under inheritance
 * the source may differ from the rule being validated, and the path is
 * relative to that source.
 */
interface CreditEntry {
  kind: CreditEntryKind;
  credit: number;
  validationRule: AccessControlValidationRule;
  path: AccessControlIssuePath;
}

/**
 * Credit may stay constant only from the due window into the immediately
 * following window. Adjacency to `due` is what prevents consecutive equal
 * late deadlines or equal credit after a late deadline.
 */
function isValidCreditTransition(previous: CreditEntry, current: CreditEntry): boolean {
  if (current.credit < previous.credit) return true;
  return (
    current.credit === previous.credit &&
    previous.kind === 'due' &&
    (current.kind === 'lateDeadline' || current.kind === 'afterLastDeadline')
  );
}

type DateControlField = keyof NonNullable<AccessControlJson['dateControl']>;

/**
 * Builds the chronological credit timeline for a rule. `sourceForField`
 * resolves where each `dateControl` field comes from: the rule itself for
 * per-rule validation, or self-or-default for cross-rule validation.
 *
 * When `synthesizeImplicitDue` is true and the rule has any other credit
 * field set without a `due`, an implicit 100% due entry is inserted so the
 * credit-ordering check has an anchor. Per-rule validation only synthesizes
 * for the default rule (overrides may legitimately omit `due` and inherit
 * it); cross-rule validation always synthesizes since any override's
 * effective timeline includes the inherited due.
 */
function buildCreditTimeline(
  sourceForField: <K extends DateControlField>(field: K) => AccessControlValidationRule,
  synthesizeImplicitDue: boolean,
): CreditEntry[] {
  const entries: CreditEntry[] = [];

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

  const afterLastSource = sourceForField('afterLastDeadline');
  const afterLast = afterLastSource.rule.dateControl?.afterLastDeadline;
  const afterLastCredit = afterLast?.allowSubmissions === true ? afterLast.credit : undefined;

  const needsImplicitDue =
    synthesizeImplicitDue &&
    (entries.length > 0 || lateDeadlines.length > 0 || afterLastCredit !== undefined);
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

  if (afterLastCredit !== undefined) {
    entries.push({
      kind: 'afterLastDeadline',
      credit: afterLastCredit,
      validationRule: afterLastSource,
      path: ['dateControl', 'afterLastDeadline', 'credit'],
    });
  }

  return entries;
}

/** Per-rule credit timeline: every field is sourced from the rule itself. */
function getRuleCreditEntries(validationRule: AccessControlValidationRule): CreditEntry[] {
  if (!validationRule.rule.dateControl) return [];
  return buildCreditTimeline(() => validationRule, validationRule.targetType === 'none');
}

/**
 * Effective credit timeline for an override after inheritance: each field
 * comes from the override itself if it sets it, otherwise from the default
 * rule. We deliberately do not model label-on-label cascade — the other
 * global validators are similarly coarse, and the enrollment case can't be
 * modeled accurately without knowing each student's labels.
 */
function getEffectiveCreditEntries(
  validationRules: AccessControlValidationRule[],
  validationRuleIndex: number,
): CreditEntry[] {
  const validationRule = validationRules[validationRuleIndex];
  const defaultValidationRule =
    validationRules.find((rule) => rule.targetType === 'none') ?? validationRules[0];

  const sourceForField = <K extends DateControlField>(field: K): AccessControlValidationRule =>
    validationRule.rule.dateControl?.[field] !== undefined ? validationRule : defaultValidationRule;

  return buildCreditTimeline(sourceForField, true);
}

/**
 * Picks which credit entry to attach a cross-rule error to. If both endpoints
 * of a violation belong to the current override, returns null — the per-rule
 * validator already reports the same issue against that rule. Otherwise
 * attributes the error to whichever endpoint is from the current rule, so
 * the form highlights the field the author can actually edit.
 */
function chooseEffectiveIssueEntry(
  currentValidationRule: AccessControlValidationRule,
  preferredEntry: CreditEntry | undefined,
  fallbackEntry: CreditEntry | undefined,
): CreditEntry | null {
  const preferredFromCurrent = preferredEntry?.validationRule === currentValidationRule;
  const fallbackFromCurrent = fallbackEntry?.validationRule === currentValidationRule;
  if (preferredFromCurrent && fallbackFromCurrent) return null;
  if (preferredFromCurrent) return preferredEntry;
  if (fallbackFromCurrent) return fallbackEntry;
  return null;
}

type AfterCompleteQuestions = NonNullable<
  NonNullable<AccessControlJson['afterComplete']>['questions']
>;
type AfterCompleteScore = NonNullable<NonNullable<AccessControlJson['afterComplete']>['score']>;

type AfterCompleteCrossFieldIssueKind =
  | 'score_hidden_requires_questions_hidden'
  | 'questions_reveal_requires_score_reveal'
  | 'score_reveal_after_questions_reveal';

interface AfterCompleteCrossFieldIssue {
  kind: AfterCompleteCrossFieldIssueKind;
  message: string;
}

function resolveEffectiveAfterComplete(
  rule: AccessControlJson,
  defaultRule: AccessControlJson | undefined,
): { questions: AfterCompleteQuestions; score: AfterCompleteScore } {
  const ruleAc = rule.afterComplete;
  const defaultAc = defaultRule?.afterComplete;
  // Defaults: questions hidden, score visible. An override that doesn't
  // include questions/score inherits the default rule's effective value.
  // Inheritance is whole-object, not field-by-field: an override that sets
  // `questions: { hidden: true }` (without dates) does NOT inherit the
  // default's `visibleFromDate`.
  const questions = ruleAc?.questions ?? defaultAc?.questions ?? { hidden: true };
  const score = ruleAc?.score ?? defaultAc?.score ?? { hidden: false };
  return { questions, score };
}

/**
 * Checks the cross-field invariant between `afterComplete.questions` and
 * `afterComplete.score`: questions cannot become visible while the score
 * remains hidden. Returns `null` when the pair is consistent, otherwise an
 * issue with a `kind` discriminator and a human-readable message. The kinds
 * are:
 *
 * - `score_hidden_requires_questions_hidden`: score is hidden after completion
 *   but questions are visible.
 * - `questions_reveal_requires_score_reveal`: questions have a reveal date but
 *   the score stays hidden forever.
 * - `score_reveal_after_questions_reveal`: both reveal, but the score's reveal
 *   date is after the questions' reveal date.
 *
 * Used by both the per-rule validator and the legacy migration's fix-up
 * step, so the two stay aligned on what counts as a conflict.
 */
export function getAfterCompleteCrossFieldIssue(
  questions: AfterCompleteQuestions,
  score: AfterCompleteScore,
): AfterCompleteCrossFieldIssue | null {
  if (score.hidden && !questions.hidden) {
    return {
      kind: 'score_hidden_requires_questions_hidden',
      message: 'Questions cannot be made visible after completion while the score is hidden.',
    };
  }
  if (!questions.hidden || questions.visibleFromDate === undefined) return null;
  if (!score.hidden) return null;
  if (score.visibleFromDate === undefined) {
    return {
      kind: 'questions_reveal_requires_score_reveal',
      message:
        'Questions cannot become visible after completion while the score remains hidden. Either make the score visible after completion, or reveal the score on or before the question reveal date.',
    };
  }
  if (new Date(score.visibleFromDate).getTime() > new Date(questions.visibleFromDate).getTime()) {
    return {
      kind: 'score_reveal_after_questions_reveal',
      message: 'The score must become visible on or before the question reveal date.',
    };
  }
  return null;
}

/**
 * Cross-field afterComplete validation. Checks that the effective
 * questions/score visibility is internally consistent, including for overrides
 * that only override one of the two fields (the inherited side is resolved
 * against the default rule). The error is reported on the questions field; the
 * score field is treated as the trailing dependency in the relationship.
 */
export function validateAfterCompleteCrossFieldIssues(
  validationRules: AccessControlValidationRule[],
): AccessControlValidationIssue[] {
  const issues: AccessControlValidationIssue[] = [];
  if (validationRules.length === 0) return issues;

  const defaultRule = validationRules.find((vr) => vr.targetType === 'none')?.rule;

  for (const validationRule of validationRules) {
    const { questions, score } = resolveEffectiveAfterComplete(validationRule.rule, defaultRule);
    const issue = getAfterCompleteCrossFieldIssue(questions, score);
    if (issue) {
      pushIssue(issues, validationRule, ['afterComplete', 'questions'], issue.message);
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
 * Validates credit ordering within a single access control rule: post-due
 * credits must be at most 100%, and credits must strictly decrease except for
 * the first credit window after the due date, which may equal the due credit.
 */
export function validateRuleCreditOrderingIssues(
  validationRule: AccessControlValidationRule,
): AccessControlValidationIssue[] {
  const issues: AccessControlValidationIssue[] = [];
  const entries = getRuleCreditEntries(validationRule);

  const postDueEntry = entries.find(
    (entry) =>
      (entry.kind === 'lateDeadline' || entry.kind === 'afterLastDeadline') && entry.credit > 100,
  );
  if (postDueEntry) {
    pushIssue(issues, validationRule, postDueEntry.path, POST_DUE_CREDIT_MESSAGE);
  }

  for (let i = 1; i < entries.length; i++) {
    if (isValidCreditTransition(entries[i - 1], entries[i])) {
      continue;
    }
    pushIssue(issues, validationRule, entries[i].path, 'Credit must strictly decrease over time.');
  }

  return issues;
}

/**
 * Validates a single access control rule. Checks duplicates, date ordering,
 * credit ordering, and target-type constraints (e.g. integrations and
 * beforeRelease are only valid on the default rule).
 *
 * @param rule The access control rule to validate.
 * @param targetType 'none' for the default rule, 'student_label' or 'enrollment' for overrides.
 * @param options Optional flags.
 * @param options.includeAfterCompleteCrossField Whether to include the afterComplete
 * cross-field check (defaults to `true`). Callers that also run
 * {@link validateAfterCompleteCrossFieldIssues} across all rules should pass `false`
 * to avoid duplicate errors, since that validator already covers the same constraint
 * and additionally handles inheritance.
 */
export function validateRule(
  rule: AccessControlJson,
  targetType: 'none' | 'student_label' | 'enrollment',
  options: { includeAfterCompleteCrossField?: boolean } = {},
): string[] {
  const errors: string[] = [];
  const includeAfterCompleteCrossField = options.includeAfterCompleteCrossField ?? true;

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

  if (includeAfterCompleteCrossField) {
    const { questions, score } = resolveEffectiveAfterComplete(rule, undefined);
    const issue = getAfterCompleteCrossFieldIssue(questions, score);
    if (issue) errors.push(issue.message);
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
  // Credit ordering assumes deadlines are chronological; skip if dates are
  // out of order to avoid misleading credit-ordering errors.
  if (dateErrors.length === 0) {
    errors.push(
      ...validateRuleCreditOrderingIssues({
        rule,
        targetType,
        ruleIndex: 0,
      }).map((issue) => issue.message),
    );
  }

  return errors;
}

function formatValues(values: Set<string> | string[]) {
  return Array.from(values)
    .map((v) => `"${v}"`)
    .join(', ');
}

export function getAccessControlRuleTargetType(
  rule: AccessControlJson,
  index: number,
): AccessControlRuleTargetType {
  if (index === 0) return 'none';
  return rule.labels == null ? 'enrollment' : 'student_label';
}

/**
 * Validates an array of access control rules.
 * Returns a single object with all accumulated errors and warnings.
 *
 * @param params
 * @param params.rules The full ordered list of access control rules: index 0
 * is the default rule that applies to everyone. Non-default entries with
 * `labels` are student-label rules, and trailing entries without `labels` are
 * student-specific rules.
 * @param params.validStudentLabelNames Optional set of known student label names for
 * cross-referencing validation.
 */
export function validateAccessControlRules({
  rules,
  validStudentLabelNames,
}: {
  rules: AccessControlJson[];
  validStudentLabelNames?: Set<string>;
}): { warnings: string[]; errors: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const validationRules: AccessControlValidationRule[] = [];

  // If the feature is completely unused, we can skip all validation and we don't need a default rule.
  if (rules.length === 0) {
    return { errors, warnings };
  }

  const targetTypes = rules.map((rule, index) => getAccessControlRuleTargetType(rule, index));

  const studentLabelRuleCount = targetTypes.filter((type) => type === 'student_label').length;
  if (studentLabelRuleCount > MAX_STUDENT_LABEL_ACCESS_CONTROL_RULES) {
    errors.push(
      `An assessment can have at most ${MAX_STUDENT_LABEL_ACCESS_CONTROL_RULES} student-label access control overrides.`,
    );
  }

  const enrollmentRuleCount = targetTypes.filter((type) => type === 'enrollment').length;
  if (enrollmentRuleCount > MAX_ENROLLMENT_ACCESS_CONTROL_RULES) {
    errors.push(
      `An assessment can have at most ${MAX_ENROLLMENT_ACCESS_CONTROL_RULES} student-specific access control overrides.`,
    );
  }

  if (rules.slice(1).some((rule) => rule.uuid == null)) {
    errors.push('Every non-default accessControl rule must specify uuid.');
  }

  if (rules[0].labels != null) {
    errors.push('No defaults found. The first element of accessControl must apply to everyone.');
  }

  const seenRuleUuids = new Set<string>();
  const duplicateRuleUuids = new Set<string>();
  for (const rule of rules.slice(1)) {
    if (rule.uuid == null) continue;
    if (seenRuleUuids.has(rule.uuid)) {
      duplicateRuleUuids.add(rule.uuid);
    } else {
      seenRuleUuids.add(rule.uuid);
    }
  }
  if (duplicateRuleUuids.size > 0) {
    errors.push(`Found duplicate access control rule UUIDs: ${formatValues(duplicateRuleUuids)}.`);
  }

  let seenStudentSpecificRule = false;
  for (const [index, targetType] of targetTypes.entries()) {
    if (index === 0) continue;
    if (targetType === 'enrollment') {
      seenStudentSpecificRule = true;
    } else if (targetType === 'student_label' && seenStudentSpecificRule) {
      errors.push(
        'Student-label access control rules must appear before student-specific access control rules.',
      );
      break;
    }
  }

  rules.forEach((rule, ruleIndex) => {
    const targetType = targetTypes[ruleIndex];
    if (targetType === 'none' && rule.uuid != null) {
      errors.push('uuid can only be specified on non-default access control rules.');
    }

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
      ruleIndex,
    });

    errors.push(...validateRule(rule, targetType, { includeAfterCompleteCrossField: false }));
  });

  errors.push(
    ...validateGlobalDateConsistencyIssues(validationRules).map((issue) => issue.message),
    ...validateGlobalCreditConsistencyIssues(validationRules).map((issue) => issue.message),
    ...validateGlobalStructuralDependencyIssues(validationRules).map((issue) => issue.message),
    ...validateAfterCompleteCrossFieldIssues(validationRules).map((issue) => issue.message),
  );

  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
}
