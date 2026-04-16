/**
 * Migration library for converting legacy allowAccess arrays to modern accessControl format.
 */

import * as fs from 'fs/promises';
import * as path from 'path';

import { assertNever } from '@prairielearn/utils';

import type { AccessControlJsonInput } from '../../schemas/accessControl.js';
import type { AssessmentAccessRuleJson } from '../../schemas/infoAssessment.js';
import { discoverInfoDirs } from '../discover-info-dirs.js';
import { formatJsonWithPrettier } from '../prettier.js';

type BaseArchetype =
  | 'always-open'
  | 'practice-only'
  | 'declining-credit'
  | 'hidden'
  | 'mode-gated'
  | 'multi-deadline'
  | 'no-op'
  | 'password-gated'
  | 'single-deadline'
  | 'single-deadline-with-viewing'
  | 'single-reduced-credit'
  | 'timed-assessment'
  | 'unclassified'
  | 'view-only';
export type ArchetypeModifier = 'mode-gated' | 'hides-closed' | 'hides-score' | 'prairietest';
export interface Archetype {
  base: BaseArchetype;
  modifiers: ArchetypeModifier[];
}

export interface MigrationResult {
  archetype: Archetype;
  result: AccessControlJsonInput;
  errors: string[];
  notes: string[];
  hasUidRules: boolean;
}

export interface AssessmentMigrationAnalysis {
  tid: string;
  title: string;
  type: string;
  archetype: Archetype;
  ruleCount: number;
  hasUidRules: boolean;
  errors: string[];
  notes: string[];
}

interface CourseInstanceMigrationAnalysis {
  assessments: AssessmentMigrationAnalysis[];
  hasLegacyRules: boolean;
}

const NON_CONTIGUOUS_ACCESS_WINDOWS_ERROR = 'Non-contiguous access windows are not supported.';
const UNCLASSIFIED_ACCESS_RULES_ERROR = 'This access rule configuration is not supported.';
const MODE_ONLY_ACCESS_RULES_ERROR = 'Mode-only access rules are not supported.';

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

/**
 * Detects non-credit rules (credit: 0) that extend beyond the last credit
 * deadline. When found, sets `afterLastDeadline` to allow submissions with
 * 0 credit. Skips if `afterLastDeadline` is already set (e.g. from
 * open-ended credit rules in declining-credit).
 *
 * Uses `dateControl.dueDate` as the effective deadline when
 * `findLastCreditEndDate` returns nothing (e.g. password-gated rules where
 * credit is implicit).
 */
function applyPracticeWindow(
  result: AccessControlJsonInput,
  rules: AssessmentAccessRuleJson[],
): void {
  if (!result.dateControl || result.dateControl.afterLastDeadline) return;

  const lastDeadline = findLastCreditEndDate(rules) ?? result.dateControl.dueDate ?? undefined;
  if (!lastDeadline) return;

  const hasPracticeWindow = rules.some(
    (r) => (r.credit ?? 0) === 0 && r.endDate && r.endDate > lastDeadline,
  );
  if (hasPracticeWindow) {
    result.dateControl.afterLastDeadline = { allowSubmissions: true, credit: 0 };
  }
}

function applyVisibilityMigration(
  result: AccessControlJsonInput,
  rules: AssessmentAccessRuleJson[],
): void {
  const afterComplete = buildAfterComplete(rules);
  if (afterComplete) result.afterComplete = afterComplete;
  if (shouldListBeforeRelease(rules)) result.listBeforeRelease = true;
}

/**
 * Filters and normalizes legacy rules before classification/migration:
 * - Removes rules with `uids` (handled separately as enrollment overrides).
 * - Removes rules with a `role` that is neither absent nor 'Student' (these
 *   are not synced; see assessments.ts fromDisk).
 * - Strips `mode: 'Public'`. Public is the default server mode, so this is
 *   effectively a no-op for students (only blocks access during Exam mode,
 *   which doesn't happen in practice for non-exam assessments). The modern
 *   accessControl format has no `mode` field, and PR #10505 removed
 *   `mode: 'Public'` from docs/examples as unnecessary.
 */
function normalizeRules(rules: AssessmentAccessRuleJson[]): AssessmentAccessRuleJson[] {
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

interface RuleAnalysis {
  hasPassword: boolean;
  creditType: 'bonus' | 'full' | 'reduced' | 'none';
  hasDates: boolean;
  isActive: boolean;
  isTimed: boolean;
  hasMode: boolean;
  hidesClosedAssessment: boolean;
  hidesClosedScore: boolean;
  isOpenCredit: boolean;
}

function analyzeRule(rule: AssessmentAccessRuleJson): RuleAnalysis {
  const hasStart = 'startDate' in rule;
  const hasEnd = 'endDate' in rule;
  const credit = rule.credit ?? 0;
  const active = rule.active ?? true;

  let creditType: RuleAnalysis['creditType'] = 'none';
  if (credit > 100) creditType = 'bonus';
  else if (credit === 100) creditType = 'full';
  else if (credit > 0) creditType = 'reduced';

  return {
    hasPassword: !!rule.password,
    creditType,
    hasDates: hasStart || hasEnd,
    isActive: active,
    isTimed: !!rule.timeLimitMin,
    hasMode: !!rule.mode,
    hidesClosedAssessment: (rule.showClosedAssessment ?? true) === false,
    hidesClosedScore: (rule.showClosedAssessmentScore ?? true) === false,
    isOpenCredit: credit > 0 && !hasStart && !hasEnd,
  };
}

// Maximum gap in milliseconds between consecutive access windows that is
// still treated as contiguous. Course authors commonly write windows like
// endDate "23:59:59" / startDate "00:00:01" the next day, producing small
// gaps that are clearly intended to be contiguous.
const MAX_CONTIGUOUS_GAP_MS = 90 * 1000; // 90 seconds

function hasAccessGaps(rules: AssessmentAccessRuleJson[]): boolean {
  const accessRules = rules.filter((r) => (r.credit ?? 0) > 0);
  if (accessRules.length === 0) return false;

  // If any access rule has no dates, it covers all time — no gaps possible.
  if (accessRules.some((r) => !r.startDate && !r.endDate)) return false;

  // Sort by startDate (no startDate = earliest possible, sorts first).
  const sorted = [...accessRules].sort((a, b) =>
    (a.startDate ?? '').localeCompare(b.startDate ?? ''),
  );

  // Merge intervals and look for gaps. Track the furthest end seen;
  // null means the merged interval extends to +∞.
  let furthestEnd: string | null = sorted[0].endDate ?? null;

  for (let i = 1; i < sorted.length; i++) {
    const rule = sorted[i];
    // Once coverage extends to +∞, no further gaps are possible.
    if (furthestEnd === null) break;
    // A gap exists if this rule starts sufficiently after the current
    // coverage ends. Small gaps (≤ 1 day) are tolerated since they
    // typically arise from authors using "23:59:59" / "00:00:01" boundaries.
    if (rule.startDate && rule.startDate > furthestEnd) {
      const gapMs = new Date(rule.startDate).getTime() - new Date(furthestEnd).getTime();
      if (gapMs > MAX_CONTIGUOUS_GAP_MS) return true;
    }
    // Extend coverage.
    if (!rule.endDate) {
      furthestEnd = null;
    } else if (rule.endDate > furthestEnd) {
      furthestEnd = rule.endDate;
    }
  }

  return false;
}

function classifyArchetype(rules: AssessmentAccessRuleJson[]): Archetype {
  rules = normalizeRules(rules);

  // First pass: detect and strip PrairieTest rules. The exam integration is
  // orthogonal to the date/credit classification, so we add it as a modifier
  // and classify the remaining rules normally.
  const hasPrairieTest = rules.some((r) => r.examUuid);
  const nonExamRules = rules.filter((r) => !r.examUuid);

  const analyzed = nonExamRules.map(analyzeRule);
  const creditRules = analyzed.filter((r) => r.creditType !== 'none');
  const nonCreditRules = analyzed.filter((r) => r.creditType === 'none');

  const hasPassword = analyzed.some((r) => r.hasPassword);
  const hasTimed = analyzed.some((r) => r.isTimed && r.creditType !== 'none');
  const hasBonusCredit = creditRules.some((r) => r.creditType === 'bonus');
  const hasFullCredit = creditRules.some((r) => r.creditType === 'full');
  const hasReducedCredit = creditRules.some((r) => r.creditType === 'reduced');
  const hasOpenCredit = creditRules.some((r) => r.isOpenCredit);
  const hasViewing = nonCreditRules.some(
    (r) => !r.isActive && r.hasDates && !r.hasPassword && !r.hidesClosedAssessment,
  );
  const hasHiding = nonCreditRules.some(
    (r) => !r.isActive || r.hidesClosedAssessment || r.hidesClosedScore,
  );
  const hasModeGate = analyzed.some((r) => r.hasMode);

  const modifiers: ArchetypeModifier[] = [];
  if (hasPrairieTest) modifiers.push('prairietest');
  if (creditRules.some((r) => r.hasMode)) modifiers.push('mode-gated');
  else if (hasModeGate && !hasViewing && !hasHiding) modifiers.push('mode-gated');
  if (creditRules.some((r) => r.hidesClosedAssessment)) modifiers.push('hides-closed');
  else if (creditRules.some((r) => r.hidesClosedScore)) modifiers.push('hides-score');

  // Detect gaps between access windows (ACCESS <-> NO ACCESS <-> ACCESS).
  // The modern format cannot represent non-contiguous access periods.
  if (hasAccessGaps(nonExamRules)) {
    return { base: 'unclassified', modifiers: [] };
  }

  const allNoOp = analyzed.every(
    (r) =>
      r.creditType === 'none' &&
      r.isActive &&
      !r.hasDates &&
      !r.isTimed &&
      !r.hasMode &&
      !r.hasPassword &&
      !r.hidesClosedAssessment &&
      !r.hidesClosedScore,
  );

  if (allNoOp) {
    return { base: 'no-op', modifiers };
  } else if (hasPassword) {
    return { base: 'password-gated', modifiers: [] };
  } else if (hasTimed) {
    return { base: 'timed-assessment', modifiers };
  } else if (
    (hasFullCredit && hasReducedCredit) ||
    (hasBonusCredit && hasReducedCredit) ||
    (hasBonusCredit && hasFullCredit)
  ) {
    return { base: 'declining-credit', modifiers };
  } else if (hasOpenCredit) {
    return { base: 'always-open', modifiers };
  } else if ((hasFullCredit || hasBonusCredit) && creditRules.length === 1) {
    const base = hasViewing || hasHiding ? 'single-deadline-with-viewing' : 'single-deadline';
    return { base, modifiers };
  } else if (hasFullCredit && creditRules.length > 1) {
    return { base: 'multi-deadline', modifiers };
  } else if (hasReducedCredit && creditRules.length === 1) {
    return { base: 'single-reduced-credit', modifiers };
  } else if (creditRules.length === 0 && nonCreditRules.some((r) => r.isActive && r.hasDates)) {
    return { base: 'practice-only', modifiers: [] };
  } else if (hasViewing && creditRules.length === 0) {
    return { base: 'view-only', modifiers };
  } else if (hasHiding && creditRules.length === 0 && !hasViewing) {
    return { base: 'hidden', modifiers: [] };
  } else if (hasModeGate && creditRules.length === 0) {
    return { base: 'mode-gated', modifiers: [] };
  } else {
    return { base: 'unclassified', modifiers: [] };
  }
}

function migrateSingleDeadline(rules: AssessmentAccessRuleJson[]): {
  result: AccessControlJsonInput;
  errors: string[];
  notes: string[];
} {
  const creditRules = getCreditRules(rules);
  const creditRule = creditRules[0];

  const result: AccessControlJsonInput = {};
  const credit = creditRule.credit ?? 0;

  if (credit > 0 && credit !== 100 && !creditRule.endDate) {
    return {
      result: {},
      errors: ['Open-ended credit windows cannot be automatically migrated.'],
      notes: [],
    };
  }

  const releaseDate = findReleaseDate(rules);
  if (creditRule.startDate || creditRule.endDate || releaseDate) {
    result.dateControl = {};
    if (releaseDate) result.dateControl.releaseDate = releaseDate;
    if (creditRule.timeLimitMin) result.dateControl.durationMinutes = creditRule.timeLimitMin;

    if (credit > 0 && credit < 100 && creditRule.endDate) {
      // Reduced credit: no full-credit period exists, so omit dueDate.
      // The late deadline is the sole timeline entry.
      result.dateControl.lateDeadlines = [{ date: creditRule.endDate, credit }];
    } else if (credit > 100 && creditRule.endDate) {
      // Bonus credit: no full-credit period exists, so omit dueDate.
      // The early deadline is the sole timeline entry.
      result.dateControl.earlyDeadlines = [{ date: creditRule.endDate, credit }];
    } else if (creditRule.endDate) {
      // Full credit (100%): set dueDate normally.
      result.dateControl.dueDate = creditRule.endDate;
    } else if (credit === 100) {
      // Full credit with no endDate: open forever from release.
      result.dateControl.dueDate = null;
    }
  }

  applyPracticeWindow(result, rules);
  applyVisibilityMigration(result, rules);

  return { result, errors: [], notes: [] };
}

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

function migrateDecliningCredit(rules: AssessmentAccessRuleJson[]): {
  result: AccessControlJsonInput;
  errors: string[];
  notes: string[];
} {
  const notes: string[] = [];
  const creditRules = getCreditRules(rules);

  const closedCreditRules = creditRules.filter((r) => r.endDate);
  const openEndedCreditRules = creditRules.filter((r) => !r.endDate);

  if (openEndedCreditRules.length > 0 && closedCreditRules.length === 0) {
    return {
      result: {},
      errors: ['Open-ended credit windows cannot be automatically migrated.'],
      notes: [],
    };
  }

  const bonusRules = closedCreditRules.filter((r) => (r.credit ?? 0) > 100);
  const fullRules = closedCreditRules.filter((r) => (r.credit ?? 0) === 100);
  const reducedRules = closedCreditRules.filter(
    (r) => (r.credit ?? 0) > 0 && (r.credit ?? 0) < 100,
  );

  // Only derive dueDate from full-credit rules. When there are no full-credit
  // rules (e.g. bonus + reduced only), omitting dueDate avoids placing deadline
  // entries at the due-date boundary where the resolver would filter them out.
  const fullEndDates = fullRules
    .map((r) => r.endDate)
    .filter(Boolean)
    .sort() as string[];
  const dueDate = fullEndDates[fullEndDates.length - 1] as string | undefined;

  const releaseDate = findReleaseDate(rules);

  const result: AccessControlJsonInput = {
    dateControl: {},
  };
  if (releaseDate) result.dateControl!.releaseDate = releaseDate;
  if (dueDate) result.dateControl!.dueDate = dueDate;

  if (bonusRules.length > 0) {
    const { deadlines, notes: deadlineNotes } = normalizeCreditDeadlines(bonusRules, 'early');
    notes.push(...deadlineNotes);
    if (deadlines.length > 0) result.dateControl!.earlyDeadlines = deadlines;
  }

  if (reducedRules.length > 0) {
    const { deadlines, notes: deadlineNotes } = normalizeCreditDeadlines(reducedRules, 'late');
    notes.push(...deadlineNotes);
    if (deadlines.length > 0) result.dateControl!.lateDeadlines = deadlines;
  }

  if (openEndedCreditRules.length > 0) {
    const maxOpenCredit = Math.max(...openEndedCreditRules.map((r) => r.credit ?? 0));
    result.dateControl!.afterLastDeadline = { allowSubmissions: true, credit: maxOpenCredit };
  }

  applyPracticeWindow(result, rules);
  applyVisibilityMigration(result, rules);

  return { result, errors: [], notes };
}

function migrateViewOnly(rules: AssessmentAccessRuleJson[]): {
  result: AccessControlJsonInput;
  errors: string[];
  notes: string[];
} {
  const allDates = rules.map((r) => r.startDate).filter(Boolean) as string[];
  const releaseDate = allDates.sort()[0];

  const result: AccessControlJsonInput = {
    dateControl: {
      dueDate: null,
    },
  };
  if (releaseDate) result.dateControl!.releaseDate = releaseDate;

  return { result, errors: [], notes: [] };
}

function migrateMultiDeadline(rules: AssessmentAccessRuleJson[]): {
  result: AccessControlJsonInput;
  errors: string[];
  notes: string[];
} {
  const notes: string[] = [];
  const creditRules = getCreditRules(rules);

  const startDates = creditRules
    .map((r) => r.startDate)
    .filter(Boolean)
    .sort() as string[];
  const endDates = creditRules
    .map((r) => r.endDate)
    .filter(Boolean)
    .sort() as string[];
  const releaseDate = findReleaseDate(rules) ?? startDates[0];
  const dueDate = endDates[endDates.length - 1];

  if (creditRules.length > 1) {
    notes.push(
      `${creditRules.length} full-credit windows collapsed into single span: ${startDates[0]} to ${dueDate}`,
    );
  }

  const result: AccessControlJsonInput = {
    dateControl: {},
  };
  if (releaseDate) result.dateControl!.releaseDate = releaseDate;
  if (dueDate) result.dateControl!.dueDate = dueDate;

  applyPracticeWindow(result, rules);
  applyVisibilityMigration(result, rules);

  return { result, errors: [], notes };
}

function migratePasswordGated(rules: AssessmentAccessRuleJson[]): {
  result: AccessControlJsonInput;
  errors: string[];
  notes: string[];
} {
  const passwordRule = rules.find((r) => r.password)!;

  const result: AccessControlJsonInput = {
    dateControl: {
      password: passwordRule.password!,
    },
  };
  if (passwordRule.startDate) result.dateControl!.releaseDate = passwordRule.startDate;
  if (passwordRule.endDate) result.dateControl!.dueDate = passwordRule.endDate;

  applyPracticeWindow(result, rules);
  applyVisibilityMigration(result, rules);

  return { result, errors: [], notes: [] };
}

function migrateHidden(_rules: AssessmentAccessRuleJson[]): {
  result: AccessControlJsonInput;
  errors: string[];
  notes: string[];
} {
  return {
    result: {},
    errors: [],
    notes: [],
  };
}

function migrateNoOp(
  _rules: AssessmentAccessRuleJson[],
  modifiers: ArchetypeModifier[],
): {
  result: AccessControlJsonInput;
  errors: string[];
  notes: string[];
} {
  const notes: string[] = [];
  if (modifiers.length === 0) {
    notes.push('An empty accessControl list signifies that no access is granted.');
  }
  return { result: {}, errors: [], notes };
}

function migrateAlwaysOpen(rules: AssessmentAccessRuleJson[]): {
  result: AccessControlJsonInput;
  errors: string[];
  notes: string[];
} {
  const creditRules = getCreditRules(rules);
  const hasNonStandardCredit = creditRules.some((r) => (r.credit ?? 0) !== 100);

  // TODO: revisit this. We might want to support an assessment where it is always open for >100% credit.
  if (hasNonStandardCredit) {
    return {
      result: {},
      errors: ['A 100% credit window is required.'],
      notes: [],
    };
  }

  const result: AccessControlJsonInput = {
    dateControl: {
      dueDate: null,
    },
  };

  applyVisibilityMigration(result, rules);

  return { result, errors: [], notes: [] };
}

function migrateKnownAllowAccess(
  baseArchetype: BaseArchetype,
  rules: AssessmentAccessRuleJson[],
  modifiers: ArchetypeModifier[],
): { result: AccessControlJsonInput; errors: string[]; notes: string[] } {
  switch (baseArchetype) {
    case 'single-deadline':
    case 'single-deadline-with-viewing':
    case 'single-reduced-credit':
    case 'timed-assessment':
      return migrateSingleDeadline(rules);

    case 'declining-credit':
      return migrateDecliningCredit(rules);

    case 'view-only':
      return migrateViewOnly(rules);

    case 'multi-deadline':
      return migrateMultiDeadline(rules);

    case 'password-gated':
      return migratePasswordGated(rules);

    case 'hidden':
      return migrateHidden(rules);

    case 'no-op':
      return migrateNoOp(rules, modifiers);
    // TODO: revisit always-open migration. The modern format requires a
    // releaseDate to grant access, so we can't express "100% credit forever"
    // without one. For now, treat this as an error rather than silently
    // producing an empty result that the resolver interprets as "no access."
    case 'always-open':
      return migrateAlwaysOpen(rules);

    // TODO: revisit practice-only migration. The modern format does not support
    // using 0 credit to indicate overall weight within the course. For now, treat
    // this as an error rather than falling back to unclassified.
    case 'practice-only':
      return {
        result: {},
        errors: ['Using 0 credit to indicate overall weight within the course is not supported.'],
        notes: [],
      };

    case 'mode-gated':
      return {
        result: {},
        errors: [MODE_ONLY_ACCESS_RULES_ERROR],
        notes: [],
      };

    case 'unclassified':
      return { result: {}, errors: [UNCLASSIFIED_ACCESS_RULES_ERROR], notes: [] };

    default:
      return assertNever(baseArchetype);
  }
}

export function migrateAllowAccess(rules: AssessmentAccessRuleJson[]): MigrationResult {
  const hasUidRules = rules.some((r) => r.uids);
  rules = normalizeRules(rules);
  const archetype: Archetype = classifyArchetype(rules);

  // Strip PrairieTest rules before date/credit migration so the classifier
  // and migrators only see the scheduling rules.
  const nonExamRules = rules.filter((r) => !r.examUuid);

  if (archetype.base === 'unclassified' && hasAccessGaps(nonExamRules)) {
    return {
      archetype,
      result: {},
      errors: [NON_CONTIGUOUS_ACCESS_WINDOWS_ERROR],
      notes: [],
      hasUidRules,
    };
  }

  const migration = migrateKnownAllowAccess(archetype.base, nonExamRules, archetype.modifiers);

  // Second pass: merge PrairieTest integration info into the result.
  if (archetype.modifiers.includes('prairietest')) {
    const examRules = rules.filter((r) => r.examUuid);
    const exams = examRules.map((r) => ({ examUuid: r.examUuid! }));
    migration.result.integrations = {
      prairieTest: { exams },
    };
  }

  if (hasUidRules) {
    migration.notes.push(
      'UID-based rules are excluded from the migrated JSON and must be recreated as enrollment overrides if needed.',
    );
  }
  return { archetype, ...migration, hasUidRules };
}

/**
 * Ensures a release date exists on the migrated result when dateControl is present.
 * If the migration didn't extract a release date from the legacy rules, the
 * fallback is used instead.
 */
function applyFallbackReleaseDate(
  result: AccessControlJsonInput,
  fallbackReleaseDate: string | undefined,
): void {
  if (result.dateControl && !result.dateControl.releaseDate && fallbackReleaseDate) {
    result.dateControl.releaseDate = fallbackReleaseDate;
  }
}

/** Migrates assessment JSON from legacy allowAccess to modern accessControl format. */
export function migrateAssessmentJson(
  jsonContent: string,
  fallbackReleaseDate?: string,
): { json: string; errors: string[]; notes: string[] } | null {
  const data = JSON.parse(jsonContent);
  const allowAccess = data.allowAccess as AssessmentAccessRuleJson[] | undefined;
  if (!allowAccess || !Array.isArray(allowAccess) || allowAccess.length === 0) return null;

  const { result, errors, notes } = migrateAllowAccess(allowAccess);

  if (errors.length > 0) return null;

  applyFallbackReleaseDate(result, fallbackReleaseDate);

  data.accessControl = [result];
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

  // Skip assessments that already use modern accessControl
  if ('accessControl' in data && !('allowAccess' in data)) {
    return null;
  }

  const allowAccess = data.allowAccess as AssessmentAccessRuleJson[] | undefined;
  if (!allowAccess || !Array.isArray(allowAccess) || allowAccess.length === 0) {
    return null;
  }

  const { archetype, errors, notes, hasUidRules } = migrateAllowAccess(allowAccess);

  return {
    tid,
    title: (data.title as string | undefined) ?? tid,
    type: (data.type as string | undefined) ?? 'unknown',
    archetype,
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

export async function applyMigrationToAssessmentFile(
  filePath: string,
  strategy: 'migrate' | 'keep' | 'clear',
  clearIncompatible: boolean,
  fallbackReleaseDate?: string,
): Promise<void> {
  const content = await fs.readFile(filePath, 'utf-8');
  const data = JSON.parse(content);

  const allowAccess = data.allowAccess as AssessmentAccessRuleJson[] | undefined;
  if (!allowAccess || !Array.isArray(allowAccess) || allowAccess.length === 0) {
    return;
  }

  // Skip if already using modern format
  if ('accessControl' in data) {
    return;
  }

  if (strategy === 'clear') {
    delete data.allowAccess;
    const formatted = await formatJsonWithPrettier(JSON.stringify(data));
    await fs.writeFile(filePath, formatted);
    return;
  }

  if (strategy === 'keep') {
    return;
  }

  // strategy === 'migrate'
  const { result, errors } = migrateAllowAccess(allowAccess);

  if (errors.length === 0) {
    applyFallbackReleaseDate(result, fallbackReleaseDate);
    data.accessControl = [result];
    delete data.allowAccess;
  } else if (clearIncompatible) {
    delete data.allowAccess;
  } else {
    // keep allowAccess as-is
    return;
  }

  const formatted = await formatJsonWithPrettier(JSON.stringify(data));
  await fs.writeFile(filePath, formatted);
}
