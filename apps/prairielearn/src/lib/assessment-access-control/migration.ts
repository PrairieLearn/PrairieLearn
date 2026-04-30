/**
 * Migration library for converting legacy allowAccess arrays to modern accessControl format.
 *
 * Architecture:
 *   1. normalizeRules — strip uids, non-Student roles, mode:Public
 *   2. Extract orthogonal concerns (PrairieTest, password)
 *   3. Precondition: reject non-contiguous access gaps
 *   4. Unified credit-timeline builder (releaseDate, dueDate, deadlines, afterLastDeadline, duration)
 *   5. Apply visibility (afterComplete, listBeforeRelease)
 *   6. Merge all pieces into final result
 */

import * as fs from 'fs/promises';
import * as path from 'path';

import { assertNever } from '@prairielearn/utils';

import {
  type AccessControlJsonInput,
  AccessControlJsonSchema,
} from '../../schemas/accessControl.js';
import type { AssessmentAccessRuleJson } from '../../schemas/infoAssessment.js';
import { discoverInfoDirs } from '../discover-info-dirs.js';
import { formatJsonWithPrettier } from '../prettier.js';

import { validateAccessControlRules } from './validation.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Migration {
  accessControl: AccessControlJsonInput;
  errors: string[];
  notes: string[];
  hasUidRules: boolean;
}

export interface AssessmentMigrationAnalysis {
  tid: string;
  title: string;
  type: string;
  ruleCount: number;
  hasUidRules: boolean;
  errors: string[];
  notes: string[];
}

interface CourseInstanceMigrationAnalysis {
  assessments: AssessmentMigrationAnalysis[];
  hasLegacyRules: boolean;
}

// ---------------------------------------------------------------------------
// Rule helpers
// ---------------------------------------------------------------------------

function getCreditRules(rules: AssessmentAccessRuleJson[]): AssessmentAccessRuleJson[] {
  return rules
    .filter((r) => (r.credit ?? 0) > 0)
    .sort((a, b) => {
      const creditDiff = (b.credit ?? 0) - (a.credit ?? 0);
      if (creditDiff !== 0) return creditDiff;
      return (a.startDate ?? '').localeCompare(b.startDate ?? '');
    });
}

function getVisibilityRules(rules: AssessmentAccessRuleJson[]): AssessmentAccessRuleJson[] {
  return rules.filter((r) => (r.active ?? true) === false && !r.examUuid && !r.password);
}

function findFirstCreditStartDate(rules: AssessmentAccessRuleJson[]): string | undefined {
  const startDates = getCreditRules(rules)
    .map((r) => r.startDate)
    .filter(Boolean)
    .sort() as string[];
  return startDates[0];
}

function findLastCreditEndDate(rules: AssessmentAccessRuleJson[]): string | undefined {
  const endDates = getCreditRules(rules)
    .map((r) => r.endDate)
    .filter(Boolean)
    .sort() as string[];
  return endDates[endDates.length - 1];
}

/**
 * Returns true when `outer`'s [start, end] window fully covers `inner`'s.
 * Both rules must be closed (have an endDate). A missing startDate on `outer`
 * means -∞; a missing startDate on `inner` makes coverage impossible unless
 * `outer` is also unbounded on the start side.
 */
function ruleCovers(outer: AssessmentAccessRuleJson, inner: AssessmentAccessRuleJson): boolean {
  if (!outer.endDate || !inner.endDate) return false;
  if (outer.endDate < inner.endDate) return false;
  if (outer.startDate) {
    if (!inner.startDate) return false;
    if (outer.startDate > inner.startDate) return false;
  }
  return true;
}

function findReleaseDate(rules: AssessmentAccessRuleJson[]): string | undefined {
  const firstCreditStartDate = findFirstCreditStartDate(rules);
  const visibilityDates = getVisibilityRules(rules)
    .map((r) => r.startDate)
    .filter(
      (date): date is string => !!date && (!firstCreditStartDate || date <= firstCreditStartDate),
    );
  if (visibilityDates.length > 0) return visibilityDates.sort()[0];

  const creditDates = getCreditRules(rules)
    .map((r) => r.startDate)
    .filter(Boolean) as string[];
  if (creditDates.length > 0) return creditDates.sort()[0];

  return undefined;
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

/**
 * Filters and normalizes legacy rules before migration:
 * - Removes rules with `uids` (handled separately as enrollment overrides).
 * - Removes rules with a `role` that is neither absent nor 'Student'.
 * - Strips `mode: 'Public'` (effectively a no-op for students).
 */
export function normalizeRules(rules: AssessmentAccessRuleJson[]): AssessmentAccessRuleJson[] {
  return rules
    .filter((r) => !r.uids)
    .filter((r) => r.role == null || r.role === 'Student')
    .map((r) => {
      if (r.mode === 'Public') {
        const { mode: _mode, ...rest } = r;
        return rest;
      }
      return r;
    });
}

// ---------------------------------------------------------------------------
// Gap detection (precondition)
// ---------------------------------------------------------------------------

const MAX_CONTIGUOUS_GAP_MS = 90 * 1000; // 90 seconds

function hasAccessGaps(rules: AssessmentAccessRuleJson[]): boolean {
  // Include zero-credit (practice) rules — they also collapse into a single
  // span during migration, so non-contiguous practice windows would silently
  // grant access through the gap if not detected here.
  const accessRules = rules.filter((r) => r.active !== false);
  if (accessRules.length === 0) return false;
  if (accessRules.some((r) => !r.startDate && !r.endDate)) return false;

  const sorted = [...accessRules].sort((a, b) =>
    (a.startDate ?? '').localeCompare(b.startDate ?? ''),
  );

  let furthestEnd: string | null = sorted[0].endDate ?? null;

  for (let i = 1; i < sorted.length; i++) {
    const rule = sorted[i];
    if (furthestEnd === null) break;
    if (rule.startDate && rule.startDate > furthestEnd) {
      const gapMs = new Date(rule.startDate).getTime() - new Date(furthestEnd).getTime();
      if (gapMs > MAX_CONTIGUOUS_GAP_MS) return true;
    }
    if (!rule.endDate) {
      furthestEnd = null;
    } else if (rule.endDate > furthestEnd) {
      furthestEnd = rule.endDate;
    }
  }

  return false;
}

function hasNonMonotonicCredit(rules: AssessmentAccessRuleJson[]): boolean {
  const creditRules = rules.filter((r) => (r.credit ?? 0) > 0);
  if (creditRules.length === 0) return false;

  const dates = new Set<string>();
  for (const r of creditRules) {
    if (r.startDate) dates.add(r.startDate);
    if (r.endDate) dates.add(r.endDate);
  }
  const sortedDates = Array.from(dates).sort();

  // Build half-open intervals across the timeline. `null` represents -∞ for
  // `start` and +∞ for `end`. A rule with no startDate is active from -∞,
  // and a rule with no endDate is active until +∞.
  const intervals: { start: string | null; end: string | null }[] = [
    { start: null, end: sortedDates[0] ?? null },
  ];
  for (let i = 0; i < sortedDates.length - 1; i++) {
    intervals.push({ start: sortedDates[i], end: sortedDates[i + 1] });
  }
  if (sortedDates.length > 0) {
    intervals.push({ start: sortedDates[sortedDates.length - 1], end: null });
  }

  let prev = -1;
  for (const { start, end } of intervals) {
    let maxCredit = 0;
    for (const r of creditRules) {
      if (r.startDate && (start === null || r.startDate > start)) continue;
      if (r.endDate && (end === null || r.endDate < end)) continue;
      maxCredit = Math.max(maxCredit, r.credit ?? 0);
    }
    if (maxCredit === 0) continue;
    if (prev >= 0 && maxCredit > prev) return true;
    prev = maxCredit;
  }

  return false;
}

function hasPracticeBeforeRelease(rules: AssessmentAccessRuleJson[]): boolean {
  const firstCreditStartDate = findFirstCreditStartDate(rules);
  if (!firstCreditStartDate) return false;

  return rules.some(
    (r) =>
      (r.credit ?? 0) === 0 &&
      (r.active ?? true) &&
      r.startDate != null &&
      r.startDate < firstCreditStartDate,
  );
}

// ---------------------------------------------------------------------------
// Visibility helpers (afterComplete, listBeforeRelease)
// ---------------------------------------------------------------------------

function buildAfterComplete(
  rules: AssessmentAccessRuleJson[],
): AccessControlJsonInput['afterComplete'] | undefined {
  const hidesAssessment = rules.some((r) => r.showClosedAssessment === false);
  const hidesScore = rules.some((r) => r.showClosedAssessmentScore === false);
  if (!hidesAssessment && !hidesScore) return undefined;

  const result: AccessControlJsonInput['afterComplete'] = {};
  if (hidesAssessment) result.questions = { hidden: true };
  if (hidesScore) result.score = { hidden: true };

  const lastCreditEndDate = findLastCreditEndDate(rules);
  if (lastCreditEndDate) {
    const visibilityRules = getVisibilityRules(rules);

    if (hidesAssessment && result.questions) {
      const questionRevealDates = visibilityRules
        .filter((r) => r.showClosedAssessment !== false)
        .map((r) => r.startDate)
        .filter((date): date is string => !!date && date > lastCreditEndDate)
        .sort();
      if (questionRevealDates[0]) result.questions.visibleFromDate = questionRevealDates[0];
    }

    if (hidesScore && result.score) {
      const scoreRevealDates = visibilityRules
        .filter((r) => r.showClosedAssessmentScore !== false)
        .map((r) => r.startDate)
        .filter((date): date is string => !!date && date > lastCreditEndDate)
        .sort();
      if (scoreRevealDates[0]) result.score.visibleFromDate = scoreRevealDates[0];
    }
  }

  return result;
}

function shouldListBeforeRelease(rules: AssessmentAccessRuleJson[]): boolean {
  const firstCreditStartDate = findFirstCreditStartDate(rules);
  if (!firstCreditStartDate) return false;

  return getVisibilityRules(rules).some((rule) => {
    if (rule.showClosedAssessment === false || rule.showClosedAssessmentScore === false) {
      return false;
    }
    if (!rule.endDate || rule.endDate > firstCreditStartDate) return false;
    if (rule.startDate && rule.startDate > firstCreditStartDate) return false;
    return true;
  });
}

function applyVisibilityMigration(
  accessControl: AccessControlJsonInput,
  rules: AssessmentAccessRuleJson[],
): void {
  const afterComplete = buildAfterComplete(rules);
  if (afterComplete) accessControl.afterComplete = afterComplete;
  if (shouldListBeforeRelease(rules)) accessControl.beforeRelease = { listed: true };
}

// ---------------------------------------------------------------------------
// Deadline normalization
// ---------------------------------------------------------------------------

function normalizeCreditDeadlines(
  rules: AssessmentAccessRuleJson[],
  deadlineKind: 'early' | 'late',
): { deadlines: { date: string; credit: number }[]; notes: string[] } {
  const bestCreditByDate = new Map<string, number>();
  for (const rule of rules) {
    if (!rule.endDate || rule.credit == null) continue;
    const previousCredit = bestCreditByDate.get(rule.endDate);
    if (previousCredit == null || rule.credit > previousCredit) {
      bestCreditByDate.set(rule.endDate, rule.credit);
    }
  }

  const sorted = Array.from(bestCreditByDate.entries())
    .map(([date, credit]) => ({ date, credit }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const kept: { date: string; credit: number }[] = [];
  let maxCreditSeen = -Infinity;
  for (let i = sorted.length - 1; i >= 0; i--) {
    const deadline = sorted[i];
    if (deadline.credit > maxCreditSeen) {
      kept.push(deadline);
      maxCreditSeen = deadline.credit;
    }
  }
  kept.reverse();

  const droppedCount = rules.filter((rule) => rule.endDate).length - kept.length;
  const notes =
    droppedCount > 0
      ? [
          `${droppedCount} ${deadlineKind} deadline${
            droppedCount === 1 ? '' : 's'
          } collapsed because higher-credit rules cover the same period.`,
        ]
      : [];

  return { deadlines: kept, notes };
}

// ---------------------------------------------------------------------------
// Unified credit-timeline builder
// ---------------------------------------------------------------------------

/**
 * If afterLastDeadline grants credit >= dueDateCredit and there are no
 * early/late deadlines describing intermediate credit windows, the dueDate
 * is meaningless — credit continues at the same or higher level forever.
 * Collapse to `due: { date: null }` (always open from release), preserving
 * the open-ended credit so we don't silently upgrade a non-100% rule to 100%.
 *
 * When early or late deadlines exist, skip the collapse so we don't drop
 * those windows on the floor (the dueDate carries them; collapsing erases
 * the structure they hang off of).
 */
function simplifyTimeline(
  dateControl: NonNullable<AccessControlJsonInput['dateControl']>,
  dueDateCredit: number,
): void {
  if (
    dateControl.afterLastDeadline &&
    !dateControl.earlyDeadlines?.length &&
    !dateControl.lateDeadlines?.length &&
    (dateControl.afterLastDeadline.credit ?? 0) >= dueDateCredit
  ) {
    const collapseCredit = dateControl.afterLastDeadline.credit ?? 0;
    dateControl.due =
      collapseCredit === 100 ? { date: null } : { date: null, credit: collapseCredit };
    delete dateControl.afterLastDeadline;
  }
}

interface BuilderResult {
  dateControl: AccessControlJsonInput['dateControl'];
  errors: string[];
  notes: string[];
}

function buildCreditTimeline(rules: AssessmentAccessRuleJson[]): BuilderResult {
  const errors: string[] = [];
  const notes: string[] = [];

  const creditRules = getCreditRules(rules);
  const allClosedCreditRules = creditRules.filter((r) => r.endDate);
  const openEndedCreditRules = creditRules.filter((r) => !r.endDate);

  // Drop closed rules whose window is fully covered by a strictly-higher-credit
  // closed rule.
  const dominatedRules = new Set<AssessmentAccessRuleJson>();
  for (const rule of allClosedCreditRules) {
    for (const other of allClosedCreditRules) {
      if (other === rule) continue;
      if ((other.credit ?? 0) > (rule.credit ?? 0) && ruleCovers(other, rule)) {
        dominatedRules.add(rule);
        break;
      }
    }
  }
  if (dominatedRules.size > 0) {
    notes.push(
      `${dominatedRules.size} credit window${dominatedRules.size === 1 ? '' : 's'} dropped because higher-credit rules cover the same period.`,
    );
  }
  const closedCreditRules = allClosedCreditRules.filter((r) => !dominatedRules.has(r));

  // No positive credit rules. If there are credit:0 rules with dates, treat
  // them as a credit-0 due window using `due.credit: 0`.
  if (creditRules.length === 0) {
    const zeroCreditRules = rules.filter(
      (r) => (r.credit ?? 0) === 0 && (r.active ?? true) && (r.startDate || r.endDate),
    );
    if (zeroCreditRules.length === 0) {
      return { dateControl: undefined, errors, notes };
    }

    const startDates = zeroCreditRules
      .map((r) => r.startDate)
      .filter(Boolean)
      .sort() as string[];
    const endDates = zeroCreditRules
      .map((r) => r.endDate)
      .filter(Boolean)
      .sort() as string[];

    const releaseDate = startDates[0];
    const dueDate = endDates.length > 0 ? endDates[endDates.length - 1] : null;

    const dateControl: NonNullable<AccessControlJsonInput['dateControl']> = {
      due: { date: dueDate, credit: 0 },
    };
    if (releaseDate) dateControl.release = { date: releaseDate };

    const timedRule = zeroCreditRules.find((r) => r.timeLimitMin);
    if (timedRule?.timeLimitMin) {
      dateControl.durationMinutes = timedRule.timeLimitMin;
    }

    return { dateControl, errors, notes };
  }

  // All credit rules are open-ended (no endDate).
  if (closedCreditRules.length === 0) {
    const allFull = openEndedCreditRules.every((r) => (r.credit ?? 0) === 100);
    if (!allFull) {
      errors.push('Open-ended credit windows without a 100% credit rule cannot be migrated.');
      return { dateControl: undefined, errors, notes };
    }
    const releaseDate = findReleaseDate(rules);
    const dateControl: NonNullable<AccessControlJsonInput['dateControl']> = {
      due: { date: null },
    };
    if (releaseDate) dateControl.release = { date: releaseDate };
    return { dateControl, errors, notes };
  }

  // --- Pick dueDate from the highest-credit closed rules ---
  // Prefer 100% rules if they exist; otherwise use highest credit.
  const fullCreditRules = closedCreditRules.filter((r) => (r.credit ?? 0) === 100);
  let dueDateRules: AssessmentAccessRuleJson[];
  let dueDateCredit: number;

  if (fullCreditRules.length > 0) {
    dueDateRules = fullCreditRules;
    dueDateCredit = 100;
  } else {
    const highestCredit = Math.max(...closedCreditRules.map((r) => r.credit ?? 0));
    dueDateRules = closedCreditRules.filter((r) => (r.credit ?? 0) === highestCredit);
    dueDateCredit = highestCredit;
  }

  const dueDateEndDates = dueDateRules
    .map((r) => r.endDate)
    .filter(Boolean)
    .sort() as string[];
  const dueDate = dueDateEndDates[dueDateEndDates.length - 1];

  // Note when multiple closed rules at dueDateCredit collapse into a single
  // span. Open-ended rules at the same credit don't count — they become
  // `afterLastDeadline`, not part of the collapsed dueDate window. Defer
  // pushing the note until after simplifyTimeline; if the timeline collapses
  // to always-open the "single span" wording would mislead.
  let pendingCollapseNote: string | null = null;
  if (dueDateRules.length > 1) {
    const startDates = dueDateRules
      .map((r) => r.startDate)
      .filter(Boolean)
      .sort() as string[];
    pendingCollapseNote = `${dueDateRules.length} ${dueDateCredit}% credit windows collapsed into single span: ${startDates[0] ?? '(open)'} to ${dueDate}`;
  }

  // --- Build dateControl ---
  const releaseDate = findReleaseDate(rules);
  const dateControl: NonNullable<AccessControlJsonInput['dateControl']> = {};
  if (releaseDate) dateControl.release = { date: releaseDate };
  if (dueDate) {
    dateControl.due =
      dueDateCredit !== 100 ? { date: dueDate, credit: dueDateCredit } : { date: dueDate };
  }

  // --- Place other closed credit rules as early/late deadlines ---
  const otherClosedRules = closedCreditRules.filter((r) => (r.credit ?? 0) !== dueDateCredit);
  const earlyRules: AssessmentAccessRuleJson[] = [];
  const lateRules: AssessmentAccessRuleJson[] = [];
  let dominatedLateCount = 0;

  for (const rule of otherClosedRules) {
    const credit = rule.credit ?? 0;
    if (credit > 100 && credit > dueDateCredit) {
      earlyRules.push(rule);
    } else if (credit < 100 && credit < dueDateCredit) {
      // Drop late rules whose window ends on or before the chosen due date —
      // the higher-credit due-date rule already covers them at higher credit,
      // so emitting a late deadline before dueDate would be redundant and
      // would fail downstream date-ordering validation.
      if (rule.endDate && dueDate && rule.endDate <= dueDate) {
        dominatedLateCount++;
        continue;
      }
      lateRules.push(rule);
    } else {
      errors.push(
        `Cannot place ${credit}% credit rule as early or late deadline (due date credit is ${dueDateCredit}%).`,
      );
    }
  }

  if (dominatedLateCount > 0) {
    notes.push(
      `${dominatedLateCount} late deadline${dominatedLateCount === 1 ? '' : 's'} dropped because the higher-credit due window covers the same period.`,
    );
  }

  if (earlyRules.length > 0) {
    const { deadlines, notes: deadlineNotes } = normalizeCreditDeadlines(earlyRules, 'early');
    notes.push(...deadlineNotes);
    if (deadlines.length > 0) dateControl.earlyDeadlines = deadlines;
  }

  if (lateRules.length > 0) {
    const { deadlines, notes: deadlineNotes } = normalizeCreditDeadlines(lateRules, 'late');
    notes.push(...deadlineNotes);
    if (deadlines.length > 0) dateControl.lateDeadlines = deadlines;
  }

  // --- afterLastDeadline from open-ended credit rules ---
  if (openEndedCreditRules.length > 0) {
    const maxOpenCredit = Math.max(...openEndedCreditRules.map((r) => r.credit ?? 0));
    dateControl.afterLastDeadline = { allowSubmissions: true, credit: maxOpenCredit };
  }

  // --- Practice window (credit:0 rules extending past last deadline) ---
  if (!dateControl.afterLastDeadline) {
    const lastDeadline = findLastCreditEndDate(rules) ?? dueDate;
    if (lastDeadline) {
      const hasPracticeWindow = rules.some(
        (r) => (r.credit ?? 0) === 0 && r.endDate && r.endDate > lastDeadline,
      );
      if (hasPracticeWindow) {
        dateControl.afterLastDeadline = { allowSubmissions: true, credit: 0 };
      }
    }
  }

  simplifyTimeline(dateControl, dueDateCredit);

  // Only emit the collapse note if a concrete due date survived the
  // simplification; otherwise the "single span" wording would mislead.
  if (pendingCollapseNote && dateControl.due?.date != null) {
    notes.push(pendingCollapseNote);
  }

  // --- Duration ---
  const timedRule = creditRules.find((r) => r.timeLimitMin);
  if (timedRule?.timeLimitMin) {
    dateControl.durationMinutes = timedRule.timeLimitMin;
  }

  return { dateControl, errors, notes };
}

// ---------------------------------------------------------------------------
// Orthogonal concern extractors
// ---------------------------------------------------------------------------

function extractPassword(rules: AssessmentAccessRuleJson[]): {
  password: string;
  remainingRules: AssessmentAccessRuleJson[];
  passwordStartDate: string | undefined;
  notes: string[];
} | null {
  const passwordRules = rules.filter((r) => r.password);
  if (passwordRules.length === 0) return null;

  const distinctPasswords = Array.from(new Set(passwordRules.map((r) => r.password!)));
  const password = distinctPasswords[0];

  const notes: string[] = [];
  if (distinctPasswords.length > 1) {
    notes.push(
      'Multiple distinct passwords were used in legacy access rules; only the first password was kept in the migrated configuration.',
    );
  }

  // Use the earliest startDate among rules using the kept password, so the
  // release date can't be pulled before any window the password originally
  // gated.
  const passwordStartDate = passwordRules
    .filter((r) => r.password === password)
    .map((r) => r.startDate)
    .filter((d): d is string => !!d)
    .sort()[0];

  // Strip the password from rules. Keep the rule itself for credit/date
  // processing. Password rules without explicit credit (credit omitted) but
  // with dates are treated as 100% credit (the implicit meaning of a
  // password-gated exam). Rules with explicit credit: 0 are left as-is.
  const remainingRules = rules
    .map((r) => {
      if (!r.password) return r;
      const { password: _pw, ...rest } = r;
      if (rest.credit == null && (rest.startDate || rest.endDate)) {
        return { ...rest, credit: 100 };
      }
      if ((rest.credit ?? 0) > 0 || rest.startDate || rest.endDate) return rest;
      return null;
    })
    .filter((r): r is AssessmentAccessRuleJson => r !== null);

  return {
    password,
    remainingRules,
    passwordStartDate,
    notes,
  };
}

function extractPrairieTest(rules: AssessmentAccessRuleJson[]): {
  integrations: AccessControlJsonInput['integrations'];
  remainingRules: AssessmentAccessRuleJson[];
  notes: string[];
} | null {
  const examRules = rules.filter((r) => r.examUuid);
  if (examRules.length === 0) return null;

  const exams = examRules.map((r) => ({ examUuid: r.examUuid! }));
  const remainingRules = rules.filter((r) => !r.examUuid);

  const notes: string[] = [];
  if (examRules.some((r) => r.password)) {
    notes.push(
      'Passwords on PrairieTest rules were discarded during migration; PrairieTest exams are gated by their own access controls.',
    );
  }

  return {
    integrations: { prairieTest: { exams } },
    remainingRules,
    notes,
  };
}

// ---------------------------------------------------------------------------
// Main migration pipeline
// ---------------------------------------------------------------------------

interface AnalysisResults {
  schedulingRules: AssessmentAccessRuleJson[];
  ptExtract: ReturnType<typeof extractPrairieTest>;
  pwExtract: ReturnType<typeof extractPassword>;
  dateControl: AccessControlJsonInput['dateControl'];
}

interface Analysis {
  errors: string[];
  notes: string[];
  hasUidRules: boolean;
  /**
   * Intermediate state used by `migrateAllowAccess` to assemble the final
   * `AccessControlJsonInput`. `null` when the analysis failed (errors is
   * non-empty). Callers that only need diagnostics can ignore this field.
   */
  results: AnalysisResults | null;
}

/**
 * Runs the diagnostic phase of the migration: normalization, orthogonal-concern
 * extraction, precondition checks, and credit-timeline construction. Use this
 * when the caller wants to know whether the migration would succeed (and what
 * notes/UID-rule warnings to surface) without producing a final
 * `AccessControlJsonInput`.
 */
function analyzeAllowAccess(rules: AssessmentAccessRuleJson[]): Analysis {
  const hasUidRules = rules.some((r) => r.uids);
  rules = normalizeRules(rules);

  const notes: string[] = [];
  if (hasUidRules) {
    notes.push(
      'UID-based rules are excluded from the migrated JSON and must be recreated as enrollment overrides if needed.',
    );
  }

  let schedulingRules = rules;

  const ptExtract = extractPrairieTest(schedulingRules);
  if (ptExtract) {
    schedulingRules = ptExtract.remainingRules;
    notes.push(...ptExtract.notes);
  }

  const pwExtract = extractPassword(schedulingRules);
  if (pwExtract) {
    schedulingRules = pwExtract.remainingRules;
    notes.push(...pwExtract.notes);
  }

  if (hasAccessGaps(schedulingRules)) {
    return {
      errors: ['Non-contiguous access windows are not supported.'],
      notes,
      hasUidRules,
      results: null,
    };
  }

  if (hasNonMonotonicCredit(schedulingRules)) {
    return {
      errors: ['Credit must be non-increasing over time.'],
      notes,
      hasUidRules,
      results: null,
    };
  }

  if (hasPracticeBeforeRelease(schedulingRules)) {
    return {
      errors: [
        'Practice windows before the assessment opens are not supported. Practice is only allowed after the assessment closes.',
      ],
      notes,
      hasUidRules,
      results: null,
    };
  }

  const hasCreditRules = schedulingRules.some((r) => (r.credit ?? 0) > 0);
  const hasModeOnly =
    !hasCreditRules &&
    schedulingRules.some((r) => r.mode) &&
    schedulingRules.every(
      (r) =>
        (r.credit ?? 0) === 0 &&
        (r.active ?? true) &&
        !r.startDate &&
        !r.endDate &&
        !r.showClosedAssessment &&
        !r.showClosedAssessmentScore,
    );
  if (hasModeOnly && !ptExtract) {
    return {
      errors: ['Mode-only access rules are not supported.'],
      notes,
      hasUidRules,
      results: null,
    };
  }

  const { dateControl, errors, notes: builderNotes } = buildCreditTimeline(schedulingRules);
  notes.push(...builderNotes);

  if (errors.length > 0) {
    return { errors, notes, hasUidRules, results: null };
  }

  // No-op detection: when nothing produced a dateControl, password, or
  // PrairieTest config, the rules collapse to a no-op. Suppress the note if
  // the rules were intentionally hidden via `active: false`.
  if (!dateControl && !ptExtract && !pwExtract) {
    const isHidden = schedulingRules.some((r) => (r.active ?? true) === false);
    if (!isHidden) {
      notes.push('An empty accessControl list signifies that no access is granted.');
    }
  }

  return {
    errors: [],
    notes,
    hasUidRules,
    results: { schedulingRules, ptExtract, pwExtract, dateControl },
  };
}

export function migrateAllowAccess(
  rules: AssessmentAccessRuleJson[],
  fallbackReleaseDate: string,
): Migration {
  const analysis = analyzeAllowAccess(rules);
  if (analysis.results === null) {
    const { errors, notes, hasUidRules } = analysis;
    return { accessControl: {}, errors, notes, hasUidRules };
  }

  const { schedulingRules, ptExtract, pwExtract, dateControl } = analysis.results;
  const { notes, hasUidRules } = analysis;
  const accessControl: AccessControlJsonInput = {};

  if (dateControl) {
    accessControl.dateControl = dateControl;
  } else {
    // No credit rules produced a dateControl. Check for view-only rules
    // (active: false with dates) that indicate a release date.
    const viewOnlyRules = getVisibilityRules(schedulingRules).filter((r) => r.startDate);
    if (viewOnlyRules.length > 0) {
      const releaseDate = viewOnlyRules.map((r) => r.startDate!).sort()[0];
      accessControl.dateControl = { release: { date: releaseDate }, due: { date: null } };
    }
  }

  if (pwExtract) {
    if (!accessControl.dateControl) accessControl.dateControl = {};
    accessControl.dateControl.password = pwExtract.password;

    // Don't let an earlier `active: false` visibility rule pull the release
    // date back before the password rule's startDate — that would grant the
    // password-gated credit window before the legacy password access opened.
    if (
      pwExtract.passwordStartDate &&
      accessControl.dateControl.release?.date &&
      accessControl.dateControl.release.date < pwExtract.passwordStartDate
    ) {
      accessControl.dateControl.release = { date: pwExtract.passwordStartDate };
    }
  }

  applyVisibilityMigration(accessControl, schedulingRules);

  if (ptExtract) {
    accessControl.integrations = ptExtract.integrations;
  }

  // Apply fallback release date when the migration produced a dateControl
  // without a release date (e.g. password-only or always-open rules).
  if (accessControl.dateControl && !accessControl.dateControl.release) {
    accessControl.dateControl.release = { date: fallbackReleaseDate };
  }

  // Run the assembled config through the same validators that sync uses.
  // We shouldn't be creating invalid configurations, so this acts as a safety check.
  const schemaResult = AccessControlJsonSchema.safeParse(accessControl);
  if (!schemaResult.success) {
    return {
      accessControl: {},
      errors: schemaResult.error.issues.map((issue) =>
        issue.path.length > 0 ? `${issue.path.join('.')}: ${issue.message}` : issue.message,
      ),
      notes,
      hasUidRules,
    };
  }
  const { errors: validationErrors } = validateAccessControlRules({
    rules: [accessControl],
  });
  if (validationErrors.length > 0) {
    return { accessControl: {}, errors: validationErrors, notes, hasUidRules };
  }

  return { accessControl, errors: [], notes, hasUidRules };
}

// ---------------------------------------------------------------------------
// File-level operations
// ---------------------------------------------------------------------------

/** Migrates assessment JSON from legacy allowAccess to modern accessControl format. */
export function migrateAssessmentJson(
  jsonContent: string,
  fallbackReleaseDate: string,
): { json: string; errors: string[]; notes: string[] } | null {
  const data = JSON.parse(jsonContent);
  const allowAccess = data.allowAccess as AssessmentAccessRuleJson[] | undefined;
  if (!allowAccess || !Array.isArray(allowAccess) || allowAccess.length === 0) return null;

  const { accessControl, errors, notes } = migrateAllowAccess(allowAccess, fallbackReleaseDate);

  if (errors.length > 0) return null;

  data.accessControl = [accessControl];
  delete data.allowAccess;
  return { json: JSON.stringify(data), errors, notes };
}

export async function analyzeAssessmentFile(
  filePath: string,
  tid: string,
): Promise<AssessmentMigrationAnalysis | null> {
  let data: Record<string, unknown>;
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    data = JSON.parse(content);
  } catch {
    return null;
  }

  if ('accessControl' in data && !('allowAccess' in data)) {
    return null;
  }

  const allowAccess = data.allowAccess as AssessmentAccessRuleJson[] | undefined;
  if (!allowAccess || !Array.isArray(allowAccess) || allowAccess.length === 0) {
    return null;
  }

  const { errors, notes, hasUidRules } = analyzeAllowAccess(allowAccess);

  return {
    tid,
    title: (data.title as string | undefined) ?? tid,
    type: (data.type as string | undefined) ?? 'unknown',
    ruleCount: allowAccess.length,
    hasUidRules,
    errors,
    notes,
  };
}

export async function analyzeCourseInstanceAssessments(
  courseInstancePath: string,
): Promise<CourseInstanceMigrationAnalysis> {
  const assessmentsPath = path.join(courseInstancePath, 'assessments');
  const assessments: AssessmentMigrationAnalysis[] = [];

  const assessmentDirs = await discoverInfoDirs(assessmentsPath, 'infoAssessment.json');
  for (const dir of assessmentDirs) {
    const infoPath = path.join(assessmentsPath, dir, 'infoAssessment.json');
    const analysis = await analyzeAssessmentFile(infoPath, dir);
    if (analysis) {
      assessments.push(analysis);
    }
  }

  return {
    assessments,
    hasLegacyRules: assessments.length > 0,
  };
}

/**
 * Errors and notes from `migrateAllowAccess` are intentionally discarded
 * here. The UI runs `analyzeAccessControl` ahead of time, and the errors produced here
 * will match what the user already saw.
 */
export async function applyMigrationToAssessmentFile(
  filePath: string,
  strategy: 'migrate' | 'keep' | 'clear',
  clearIncompatible: boolean,
  fallbackReleaseDate: string,
): Promise<void> {
  const content = await fs.readFile(filePath, 'utf-8');
  const data = JSON.parse(content);

  const allowAccess = data.allowAccess as AssessmentAccessRuleJson[] | undefined;
  if (!allowAccess || !Array.isArray(allowAccess) || allowAccess.length === 0) {
    return;
  }

  if ('accessControl' in data) {
    return;
  }

  switch (strategy) {
    case 'keep':
      return;
    case 'clear':
      delete data.allowAccess;
      break;
    case 'migrate': {
      const { accessControl, errors } = migrateAllowAccess(allowAccess, fallbackReleaseDate);
      if (errors.length === 0) {
        data.accessControl = [accessControl];
        delete data.allowAccess;
      } else if (clearIncompatible) {
        delete data.allowAccess;
      } else {
        return;
      }
      break;
    }
    default:
      assertNever(strategy);
  }

  const formatted = await formatJsonWithPrettier(JSON.stringify(data));
  await fs.writeFile(filePath, formatted);
}
