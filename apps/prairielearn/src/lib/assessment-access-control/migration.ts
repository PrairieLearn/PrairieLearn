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

import { Temporal } from '@js-temporal/polyfill';

import { assertNever } from '@prairielearn/utils';

import {
  type AccessControlJsonInput,
  AccessControlJsonSchema,
} from '../../schemas/accessControl.js';
import type { AssessmentAccessRuleJson } from '../../schemas/infoAssessment.js';
import { discoverInfoDirs } from '../discover-info-dirs.js';
import { formatJsonWithPrettier } from '../prettier.js';

import { getAfterCompleteCrossFieldIssue, validateAccessControlRules } from './validation.js';

export const INACTIVE_WINDOW_NOTE =
  'Inactive legacy access rules without a date-control access window cannot be faithfully migrated because modern access control cannot represent bounded view-only windows.';

function inactivePasswordNote(count: number): string {
  return `${count} password${count === 1 ? '' : 's'} on inactive legacy access rule${
    count === 1 ? '' : 's'
  } discarded because inactive rules do not allow submissions.`;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Migration {
  /**
   * Fully assembled migrated access control. `null` when the migration failed
   * (errors is non-empty).
   */
  accessControl: AccessControlJsonInput | null;
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

interface QuestionReviewWindow {
  visibleFromDate: string;
  visibleUntilDate?: string;
}

interface VisibilityMigration {
  afterComplete: AccessControlJsonInput['afterComplete'] | undefined;
  beforeRelease: AccessControlJsonInput['beforeRelease'] | undefined;
  notes: string[];
}

// ---------------------------------------------------------------------------
// Rule helpers
// ---------------------------------------------------------------------------

function getCreditRules(rules: AssessmentAccessRuleJson[]): AssessmentAccessRuleJson[] {
  return rules
    .filter((r) => (r.active ?? true) && (r.credit ?? 0) > 0)
    .sort((a, b) => {
      const creditDiff = (b.credit ?? 0) - (a.credit ?? 0);
      if (creditDiff !== 0) return creditDiff;
      return (a.startDate ?? '').localeCompare(b.startDate ?? '');
    });
}

function getInactiveRules(rules: AssessmentAccessRuleJson[]): AssessmentAccessRuleJson[] {
  return rules.filter((r) => (r.active ?? true) === false && !r.examUuid);
}

function getVisibilityRules(rules: AssessmentAccessRuleJson[]): AssessmentAccessRuleJson[] {
  return getInactiveRules(rules).filter((r) => !r.password);
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

function normalizeDateForInputDate(date: string): string {
  // Match the `input_date` sproc behavior: only the date and whole-second time
  // are used, so fractional seconds and trailing timezone markers are ignored.
  const dateParts = /([0-9]{4}-[0-9]{2}-[0-9]{2})[ T]([0-9]{2}:[0-9]{2}:[0-9]{2})/.exec(date);
  if (!dateParts) return date;
  return `${dateParts[1]}T${dateParts[2]}`;
}

function addOneSecondToInputDate(date: string): string {
  return Temporal.PlainDateTime.from(date).add({ seconds: 1 }).toString();
}

function normalizeRuleDates(rule: AssessmentAccessRuleJson): AssessmentAccessRuleJson {
  return {
    ...rule,
    ...(rule.startDate ? { startDate: normalizeDateForInputDate(rule.startDate) } : {}),
    ...(rule.endDate ? { endDate: normalizeDateForInputDate(rule.endDate) } : {}),
  };
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
  // The new format's `release` is the start of submittability, not visibility.
  // When credit rules exist, release must coincide with the first credit window
  // — otherwise the resolver would treat any earlier visibility-rule startDate
  // as a submittable 100%-credit window. Pre-credit visibility is preserved
  // separately via `beforeRelease.listed`.
  return findFirstCreditStartDate(rules);
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
    })
    .map(normalizeRuleDates);
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
  const creditRules = getCreditRules(rules);
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

function buildAfterComplete(rules: AssessmentAccessRuleJson[]): {
  afterComplete: AccessControlJsonInput['afterComplete'] | undefined;
  notes: string[];
} {
  const hidesAssessment = rules.some((r) => r.showClosedAssessment === false);
  const hidesScore = rules.some((r) => r.showClosedAssessmentScore === false);
  const questionReviewWindows = getQuestionReviewWindows(rules);

  if (!hidesAssessment && !hidesScore && questionReviewWindows.length === 0) {
    return { afterComplete: undefined, notes: [] };
  }

  const result: AccessControlJsonInput['afterComplete'] = {};
  if (hidesAssessment || questionReviewWindows.length > 0) result.questions = { hidden: true };
  if (hidesScore) result.score = { hidden: true };

  const lastCreditEndDate = findLastCreditEndDate(rules);
  const visibilityRules = getVisibilityRules(rules);
  const questionReviewWindow = questionReviewWindows[0];
  const visibleUntilDate =
    questionReviewWindows.length === 1 ? questionReviewWindow.visibleUntilDate : undefined;

  const questions = result.questions;
  if (lastCreditEndDate && questions) {
    if (questionReviewWindows.length > 0) {
      questions.visibleFromDate = questionReviewWindow.visibleFromDate;
      if (visibleUntilDate) questions.visibleUntilDate = visibleUntilDate;
    } else if (hidesAssessment) {
      const questionRevealDates = visibilityRules
        .filter((r) => r.showClosedAssessment !== false)
        .map((r) => r.startDate)
        .filter((date): date is string => !!date && date > lastCreditEndDate)
        .sort();
      if (questionRevealDates[0]) questions.visibleFromDate = questionRevealDates[0];
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

  // Enforce the same afterComplete cross-field invariant used by sync/UI.
  // If the legacy rules revealed questions before the score, push questions'
  // reveal forward to match the score's reveal date. The migration only ever
  // constructs questions/score with hidden=true, so the third issue kind
  // (score_hidden_requires_questions_hidden) is unreachable here.
  const notes: string[] = [];
  if (result.questions !== undefined && result.score !== undefined) {
    const issue = getAfterCompleteCrossFieldIssue(result.questions, result.score);
    if (issue?.kind === 'questions_reveal_requires_score_reveal') {
      const questionsFrom = result.questions.visibleFromDate;
      delete result.questions.visibleFromDate;
      delete result.questions.visibleUntilDate;
      notes.push(
        `Questions reveal date ${questionsFrom} was removed because score remains hidden after completion.`,
      );
    } else if (issue?.kind === 'score_reveal_after_questions_reveal') {
      const questionsFrom = result.questions.visibleFromDate;
      const questionsUntil = result.questions.visibleUntilDate;
      result.questions.visibleFromDate = result.score.visibleFromDate;
      // The original review-window end is no longer meaningful once the start
      // is pushed forward; drop it to keep the migrated config valid.
      delete result.questions.visibleUntilDate;
      const untilNote = questionsUntil ? ` (review-window end ${questionsUntil} dropped)` : '';
      notes.push(
        `Questions reveal date changed from ${questionsFrom} to ${result.score.visibleFromDate} so questions do not become visible while the score is still hidden${untilNote}.`,
      );
    }
  }

  // `questions: { hidden: true }` without reveal dates matches the
  // afterComplete default, so omit it from the migrated JSON.
  if (
    result.questions?.hidden &&
    result.questions.visibleFromDate == null &&
    result.questions.visibleUntilDate == null
  ) {
    delete result.questions;
  }
  if (result.questions === undefined && result.score === undefined) {
    return { afterComplete: undefined, notes };
  }

  return { afterComplete: result, notes };
}

function getQuestionReviewWindows(rules: AssessmentAccessRuleJson[]): QuestionReviewWindow[] {
  // Legacy active:false rules can create bounded review-only windows after the
  // last deadline. In accessControl, completed questions are hidden by default,
  // so model that window as hidden except visible starting at that window. If
  // there is exactly one bounded review window, preserve its end date too.
  const lastCreditEndDate = findLastCreditEndDate(rules);
  if (lastCreditEndDate == null) return [];

  const windows = getVisibilityRules(rules)
    .filter(
      (r) =>
        r.showClosedAssessment !== false &&
        ((r.startDate != null && r.startDate > lastCreditEndDate) ||
          (r.endDate != null && r.endDate > lastCreditEndDate)),
    )
    .map((r) => {
      // afterComplete dates must be strictly post-deadline, so clamp legacy
      // review windows that started before or exactly at the final deadline.
      const visibleFromDate =
        r.startDate && r.startDate > lastCreditEndDate
          ? r.startDate
          : addOneSecondToInputDate(lastCreditEndDate);
      return { visibleFromDate, visibleUntilDate: r.endDate };
    })
    .filter(
      (window) =>
        window.visibleUntilDate == null || window.visibleFromDate < window.visibleUntilDate,
    )
    .sort((a, b) => a.visibleFromDate.localeCompare(b.visibleFromDate));

  return mergeQuestionReviewWindows(windows);
}

function mergeQuestionReviewWindows(windows: QuestionReviewWindow[]): QuestionReviewWindow[] {
  const merged: QuestionReviewWindow[] = [];

  for (const window of windows) {
    const previous = merged.at(-1);
    if (previous == null) {
      merged.push(window);
      continue;
    }

    if (previous.visibleUntilDate == null) continue;

    const contiguousVisibleUntilDate = addOneSecondToInputDate(previous.visibleUntilDate);
    // Overlapping or immediately adjacent legacy review rules are still one representable window.
    // Separate windows remain separate so the caller can warn about the gap.
    if (window.visibleFromDate <= contiguousVisibleUntilDate) {
      if (window.visibleUntilDate == null) {
        delete previous.visibleUntilDate;
      } else if (window.visibleUntilDate > previous.visibleUntilDate) {
        previous.visibleUntilDate = window.visibleUntilDate;
      }
    } else {
      merged.push(window);
    }
  }

  return merged;
}

function shouldListBeforeRelease(rules: AssessmentAccessRuleJson[]): boolean {
  const firstCreditStartDate = findFirstCreditStartDate(rules);
  if (!firstCreditStartDate) return false;

  // Any visibility rule that covers some pre-release time is enough to list
  // the assessment beforehand. The rule's endDate is irrelevant — `listed` is
  // a binary flag for the pre-release segment, not a full visibility schedule.
  return getVisibilityRules(rules).some((rule) => {
    if (rule.showClosedAssessment === false || rule.showClosedAssessmentScore === false) {
      return false;
    }
    if (rule.startDate && rule.startDate >= firstCreditStartDate) return false;
    return true;
  });
}

function buildVisibilityMigration(rules: AssessmentAccessRuleJson[]): VisibilityMigration {
  const { afterComplete, notes } = buildAfterComplete(rules);
  const beforeRelease = shouldListBeforeRelease(rules) ? { listed: true as const } : undefined;
  return { afterComplete, beforeRelease, notes };
}

function applyVisibilityMigration(
  accessControl: AccessControlJsonInput,
  visibilityMigration: VisibilityMigration,
): void {
  const { afterComplete, beforeRelease } = visibilityMigration;
  if (afterComplete) accessControl.afterComplete = afterComplete;
  if (beforeRelease) accessControl.beforeRelease = beforeRelease;
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
 * Collapse to "always open from release": omit `due` entirely when the
 * collapsed credit is 100%, or use `due: { date: null, credit: X }` to
 * preserve a non-100% open-ended credit.
 *
 * When late deadlines exist, skip the collapse so we don't drop those windows
 * on the floor. Early deadlines can be preserved with `due: { date: null }`.
 * If an open-ended full-credit-or-bonus rule follows a higher-credit due
 * window, preserve the higher-credit due window as an early deadline instead
 * of emitting post-due credit at or above 100%.
 */
function simplifyTimeline(
  dateControl: NonNullable<AccessControlJsonInput['dateControl']>,
  dueDateCredit: number,
): void {
  const afterLastCredit =
    dateControl.afterLastDeadline?.allowSubmissions === true
      ? dateControl.afterLastDeadline.credit
      : 0;
  if (
    dateControl.afterLastDeadline?.allowSubmissions === true &&
    !dateControl.lateDeadlines?.length &&
    afterLastCredit >= dueDateCredit
  ) {
    if (afterLastCredit === 100 && !dateControl.earlyDeadlines?.length) {
      delete dateControl.due;
    } else {
      dateControl.due =
        afterLastCredit === 100 ? { date: null } : { date: null, credit: afterLastCredit };
    }
    delete dateControl.afterLastDeadline;
  }

  if (
    dateControl.afterLastDeadline &&
    !dateControl.lateDeadlines?.length &&
    afterLastCredit >= 100 &&
    dateControl.due?.date &&
    dueDateCredit > afterLastCredit
  ) {
    dateControl.earlyDeadlines = [
      ...(dateControl.earlyDeadlines ?? []),
      { date: dateControl.due.date, credit: dueDateCredit },
    ];
    dateControl.due =
      afterLastCredit === 100 ? { date: null } : { date: null, credit: afterLastCredit };
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
    const dateControl: NonNullable<AccessControlJsonInput['dateControl']> = {};
    if (releaseDate) dateControl.release = { date: releaseDate };
    const openTimedRule = creditRules.find((r) => r.timeLimitMin);
    if (openTimedRule?.timeLimitMin) {
      dateControl.durationMinutes = openTimedRule.timeLimitMin;
    }
    return { dateControl, errors, notes };
  }

  // --- Pick dueDate from the first drop below full credit ---
  const fullOrBonusCreditRules = closedCreditRules.filter((r) => (r.credit ?? 0) >= 100);
  let dueDateRules: AssessmentAccessRuleJson[];
  let dueDateCredit: number;

  if (fullOrBonusCreditRules.length > 0) {
    dueDateCredit = Math.min(...fullOrBonusCreditRules.map((r) => r.credit ?? 0));
    dueDateRules = fullOrBonusCreditRules.filter((r) => (r.credit ?? 0) === dueDateCredit);
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
    if (credit > dueDateCredit) {
      earlyRules.push(rule);
    } else if (credit < dueDateCredit) {
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

  // --- Practice window (active credit:0 rules extending past last deadline) ---
  // `active: false` rules forbid submissions in the legacy resolver, so
  // treating them as practice would silently grant submission rights they
  // never had.
  if (!dateControl.afterLastDeadline) {
    const lastDeadline = findLastCreditEndDate(rules) ?? dueDate;
    if (lastDeadline) {
      const hasPracticeWindow = rules.some(
        (r) => (r.credit ?? 0) === 0 && (r.active ?? true) && r.endDate && r.endDate > lastDeadline,
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
    notes,
  };
}

function stripPasswordsFromInactiveRules(rules: AssessmentAccessRuleJson[]): {
  rules: AssessmentAccessRuleJson[];
  notes: string[];
} {
  const inactivePasswordRules = new Set(getInactiveRules(rules).filter((r) => r.password));
  if (inactivePasswordRules.size === 0) return { rules, notes: [] };

  return {
    rules: rules.map((r) => {
      if (!inactivePasswordRules.has(r)) return r;
      const { password: _password, ...rest } = r;
      return rest;
    }),
    notes: [inactivePasswordNote(inactivePasswordRules.size)],
  };
}

function extractPrairieTest(rules: AssessmentAccessRuleJson[]): {
  integrations: AccessControlJsonInput['integrations'];
  remainingRules: AssessmentAccessRuleJson[];
  notes: string[];
} | null {
  const examRules = rules.filter((r) => r.examUuid);
  if (examRules.length === 0) return null;

  const examUuids = [...new Set(examRules.map((r) => r.examUuid!))];
  const exams = examUuids.map((examUuid) => ({ examUuid }));
  const remainingRules = rules.filter((r) => !r.examUuid);

  const notes: string[] = [];
  const duplicateExamCount = examRules.length - examUuids.length;
  if (duplicateExamCount > 0) {
    notes.push(
      `${duplicateExamCount} duplicate PrairieTest exam rule${duplicateExamCount === 1 ? '' : 's'} collapsed during migration.`,
    );
  }
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

function assembleAccessControl({
  ptExtract,
  pwExtract,
  dateControl,
  visibilityMigration,
  fallbackReleaseDate,
}: {
  ptExtract: ReturnType<typeof extractPrairieTest>;
  pwExtract: ReturnType<typeof extractPassword>;
  dateControl: AccessControlJsonInput['dateControl'];
  visibilityMigration: VisibilityMigration;
  fallbackReleaseDate: string;
}): AccessControlJsonInput {
  const accessControl: AccessControlJsonInput = {};

  if (dateControl) {
    accessControl.dateControl = dateControl;
  }

  if (pwExtract) {
    if (!accessControl.dateControl) accessControl.dateControl = {};
    accessControl.dateControl.password = pwExtract.password;
  }

  if (dateControl || ptExtract || pwExtract) {
    applyVisibilityMigration(accessControl, visibilityMigration);
  }

  if (ptExtract) {
    accessControl.integrations = ptExtract.integrations;
  }

  // Apply fallback release date when the migration produced a dateControl
  // without a release date (e.g. password-only or always-open rules).
  if (accessControl.dateControl && !accessControl.dateControl.release) {
    accessControl.dateControl.release = { date: fallbackReleaseDate };
  }

  return accessControl;
}

function validateMigratedAccessControl(accessControl: AccessControlJsonInput): string[] {
  const schemaResult = AccessControlJsonSchema.safeParse(accessControl);
  if (!schemaResult.success) {
    return schemaResult.error.issues.map((issue) =>
      issue.path.length > 0 ? `${issue.path.join('.')}: ${issue.message}` : issue.message,
    );
  }

  const { errors } = validateAccessControlRules({
    rules: [accessControl],
  });
  return errors;
}

/**
 * Runs the allowAccess migration pipeline: normalization, orthogonal-concern
 * extraction, precondition checks, credit-timeline construction, final
 * accessControl assembly, and final accessControl validation.
 */
export function migrateAllowAccess(
  rules: AssessmentAccessRuleJson[],
  fallbackReleaseDate: string,
): Migration {
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

  const inactivePasswordResult = stripPasswordsFromInactiveRules(schedulingRules);
  schedulingRules = inactivePasswordResult.rules;
  notes.push(...inactivePasswordResult.notes);

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
      accessControl: null,
    };
  }

  if (hasNonMonotonicCredit(schedulingRules)) {
    return {
      errors: ['Credit must be non-increasing over time.'],
      notes,
      hasUidRules,
      accessControl: null,
    };
  }

  if (hasPracticeBeforeRelease(schedulingRules)) {
    return {
      errors: [
        'Practice windows before the assessment opens are not supported. Practice is only allowed after the assessment closes.',
      ],
      notes,
      hasUidRules,
      accessControl: null,
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
      accessControl: null,
    };
  }

  const { dateControl, errors, notes: builderNotes } = buildCreditTimeline(schedulingRules);
  notes.push(...builderNotes);

  if (errors.length > 0) {
    return { errors, notes, hasUidRules, accessControl: null };
  }

  const questionReviewWindowCount = getQuestionReviewWindows(schedulingRules).length;
  if (questionReviewWindowCount > 1) {
    notes.push(
      `${questionReviewWindowCount} completed-question review windows collapsed into a single visibility window.`,
    );
  }

  const hasInactiveRulesWithoutDateControl =
    !dateControl && getInactiveRules(schedulingRules).length > 0;
  if (hasInactiveRulesWithoutDateControl && !pwExtract) notes.push(INACTIVE_WINDOW_NOTE);

  // No-op detection: when nothing produced a dateControl, password, or
  // PrairieTest config, the rules collapse to a no-op. Suppress the note if
  // the rules were intentionally hidden via `active: false`.
  if (!dateControl && !ptExtract && !pwExtract) {
    const isHidden = schedulingRules.some((r) => (r.active ?? true) === false);
    if (!isHidden) {
      notes.push('An empty accessControl list signifies that no access is granted.');
    }
  }

  const visibilityMigration = buildVisibilityMigration(schedulingRules);
  notes.push(...visibilityMigration.notes);

  const accessControl = assembleAccessControl({
    ptExtract,
    pwExtract,
    dateControl,
    visibilityMigration,
    fallbackReleaseDate,
  });
  const validationErrors = validateMigratedAccessControl(accessControl);

  return {
    errors: validationErrors,
    notes,
    hasUidRules,
    accessControl: validationErrors.length > 0 ? null : accessControl,
  };
}

// ---------------------------------------------------------------------------
// File-level operations
// ---------------------------------------------------------------------------

/**
 * Replaces `oldKey` with `newKey` (holding `value`) while preserving the
 * original property order. If `newKey` already exists alongside `oldKey`, the
 * stale `newKey` entry is dropped so it can't overwrite the replacement.
 */
export function replaceJsonKey(
  data: Record<string, unknown>,
  oldKey: string,
  newKey: string,
  value: unknown,
): Record<string, unknown> {
  const hasOldKey = Object.hasOwn(data, oldKey);
  return Object.fromEntries(
    Object.entries(data)
      .filter(([key]) => !(hasOldKey && key === newKey))
      .map(([key, val]) => (key === oldKey ? [newKey, value] : [key, val])),
  );
}

/** Migrates assessment JSON from legacy allowAccess to modern accessControl format. */
export function migrateAssessmentJson(
  jsonContent: string,
  fallbackReleaseDate: string,
): { json: string; errors: string[]; notes: string[] } | null {
  const data = JSON.parse(jsonContent);
  const allowAccess = data.allowAccess as AssessmentAccessRuleJson[] | undefined;
  if (!Array.isArray(allowAccess)) return null;

  if (allowAccess.length === 0) {
    const migrated = replaceJsonKey(data, 'allowAccess', 'accessControl', []);
    return { json: JSON.stringify(migrated), errors: [], notes: [] };
  }

  const { accessControl, errors, notes } = migrateAllowAccess(allowAccess, fallbackReleaseDate);

  if (errors.length > 0 || accessControl == null) return null;

  const migrated = replaceJsonKey(data, 'allowAccess', 'accessControl', [accessControl]);
  return { json: JSON.stringify(migrated), errors, notes };
}

export async function analyzeAssessmentFile(
  filePath: string,
  tid: string,
  fallbackReleaseDate: string,
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
  if (!Array.isArray(allowAccess)) return null;

  const { errors, notes, hasUidRules } =
    allowAccess.length === 0
      ? { errors: [], notes: [], hasUidRules: false }
      : migrateAllowAccess(allowAccess, fallbackReleaseDate);

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
  fallbackReleaseDate: string,
): Promise<CourseInstanceMigrationAnalysis> {
  const assessmentsPath = path.join(courseInstancePath, 'assessments');
  const assessments: AssessmentMigrationAnalysis[] = [];

  const assessmentDirs = await discoverInfoDirs(assessmentsPath, 'infoAssessment.json');
  for (const dir of assessmentDirs) {
    const infoPath = path.join(assessmentsPath, dir, 'infoAssessment.json');
    const analysis = await analyzeAssessmentFile(infoPath, dir, fallbackReleaseDate);
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
 * Errors and notes from `migrateAssessmentJson` are intentionally discarded
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
  if (!Array.isArray(allowAccess)) {
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
      const migrationResult = migrateAssessmentJson(content, fallbackReleaseDate);
      if (migrationResult) {
        const formatted = await formatJsonWithPrettier(migrationResult.json);
        await fs.writeFile(filePath, formatted);
        return;
      }
      if (clearIncompatible) {
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
