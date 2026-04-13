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

const BASE_ARCHETYPES = [
  'always-open',
  'declining-credit',
  'hidden',
  'mode-gated',
  'multi-deadline',
  'no-op',
  'password-gated',
  'prairietest-exam',
  'single-deadline',
  'single-deadline-with-viewing',
  'single-reduced-credit',
  'timed-assessment',
  'unclassified',
  'view-only',
] as const;

type BaseArchetype = (typeof BASE_ARCHETYPES)[number];
type ModdableArchetype =
  | 'always-open'
  | 'declining-credit'
  | 'multi-deadline'
  | 'single-deadline'
  | 'single-deadline-with-viewing'
  | 'single-reduced-credit'
  | 'timed-assessment'
  | 'view-only';
export type ArchetypeModifier = 'mode-gated' | 'hides-closed' | 'hides-score';
export interface Archetype {
  base: BaseArchetype;
  modifiers: ArchetypeModifier[];
}

function makeArchetype(base: BaseArchetype, modifiers: ArchetypeModifier[] = []): Archetype {
  return { base, modifiers };
}

export interface AssessmentMigrationAnalysis {
  tid: string;
  title: string;
  type: string;
  archetype: Archetype;
  canMigrate: boolean;
  ruleCount: number;
  hasUidRules: boolean;
  errors: string[];
  warnings: string[];
}

interface CourseInstanceMigrationAnalysis {
  assessments: AssessmentMigrationAnalysis[];
  hasLegacyRules: boolean;
  allCanMigrate: boolean;
}

const NON_CONTIGUOUS_ACCESS_WINDOWS_WARNING =
  'Non-contiguous access windows are not supported in the modern access control system.';
const UNCLASSIFIED_ACCESS_RULES_WARNING =
  'These access rules are not supported in the modern access control system.';
const NON_MIGRATABLE_ARCHETYPES: ReadonlySet<BaseArchetype> = new Set([
  'mode-gated',
  'unclassified',
]);

function isBaseArchetype(value: string): value is BaseArchetype {
  return BASE_ARCHETYPES.includes(value as BaseArchetype);
}

function parseBaseArchetype(
  archetype: string,
): { base: BaseArchetype; modifiers: string[] } | null {
  const match = archetype.match(/^(?<base>[^()]+?)(?: \((?<mods>.+)\))?$/);
  if (!match?.groups) return null;
  const base = match.groups.base.trim();
  if (!base || !isBaseArchetype(base)) return null;
  const modifiers = match.groups.mods ? match.groups.mods.split(',').map((mod) => mod.trim()) : [];
  return { base, modifiers };
}

function isArchetypeModifier(value: string): value is ArchetypeModifier {
  return value === 'mode-gated' || value === 'hides-closed' || value === 'hides-score';
}

function parseArchetype(archetype: string): Archetype | null {
  const parsed = parseBaseArchetype(archetype);
  if (parsed == null) return null;
  if (!parsed.modifiers.every(isArchetypeModifier)) return null;
  return makeArchetype(parsed.base, parsed.modifiers);
}

export function formatArchetype(archetype: Archetype): string {
  if (archetype.modifiers.length === 0) return archetype.base;
  return `${archetype.base} (${archetype.modifiers.join(', ')})`;
}

function analyzeAllowAccessRules(allowAccess: AssessmentAccessRuleJson[]) {
  const hasUidRules = allowAccess.some((rule) => rule.uids);
  const rulesForClassification = allowAccess.filter((rule) => !rule.uids);

  const archetype =
    rulesForClassification.length > 0
      ? classifyArchetype(rulesForClassification)
      : makeArchetype('unclassified');

  const {
    errors: migrationErrors,
    warnings: migrationWarnings,
  } = migrateAllowAccess(archetype, rulesForClassification);

  const errors: string[] =
    archetype.base === 'unclassified' && hasAccessGaps(rulesForClassification)
      ? [NON_CONTIGUOUS_ACCESS_WINDOWS_WARNING]
      : [...migrationErrors];
  const warnings =
    archetype.base === 'unclassified' && hasAccessGaps(rulesForClassification)
      ? []
      : [...migrationWarnings];

  if (hasUidRules) {
    warnings.push(
      'UID-based rules are excluded from the migrated JSON and must be recreated as enrollment overrides if needed.',
    );
  }

  const canMigrate = isMigratable(archetype);

  return {
    archetype,
    canMigrate,
    hasUidRules,
    errors,
    warnings,
  };
}

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

function anyHidesClosedAssessment(rules: AssessmentAccessRuleJson[]): boolean {
  return rules.some((r) => r.showClosedAssessment === false);
}

function anyHidesClosedScore(rules: AssessmentAccessRuleJson[]): boolean {
  return rules.some((r) => r.showClosedAssessmentScore === false);
}

function buildAfterComplete(
  rules: AssessmentAccessRuleJson[],
): AccessControlJsonInput['afterComplete'] | undefined {
  const hidesAssessment = anyHidesClosedAssessment(rules);
  const hidesScore = anyHidesClosedScore(rules);
  if (!hidesAssessment && !hidesScore) return undefined;

  const result: AccessControlJsonInput['afterComplete'] = {};
  if (hidesAssessment) result.hideQuestions = true;
  if (hidesScore) result.hideScore = true;

  const lastCreditEndDate = findLastCreditEndDate(rules);
  if (lastCreditEndDate) {
    const revealDates = getVisibilityRules(rules)
      .map((r) => r.startDate)
      .filter((date): date is string => !!date && date > lastCreditEndDate)
      .sort();
    const revealDate = revealDates[0];
    if (hidesAssessment && revealDate) result.showQuestionsAgainDate = revealDate;
    if (hidesScore && revealDate) result.showScoreAgainDate = revealDate;
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
  result: AccessControlJsonInput,
  rules: AssessmentAccessRuleJson[],
): void {
  const afterComplete = buildAfterComplete(rules);
  if (afterComplete) result.afterComplete = afterComplete;
  if (shouldListBeforeRelease(rules)) result.listBeforeRelease = true;
}

interface RuleAnalysis {
  isPrairieTest: boolean;
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
    isPrairieTest: !!rule.examUuid,
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

function withMods(
  base: ModdableArchetype,
  has: {
    creditModeGated: boolean;
    modeGate: boolean;
    viewing: boolean;
    hiding: boolean;
    creditHidesClosed: boolean;
    creditHidesScore: boolean;
  },
): Archetype {
  const modifiers: ArchetypeModifier[] = [];
  if (has.creditModeGated) modifiers.push('mode-gated');
  else if (has.modeGate && !has.viewing && !has.hiding) modifiers.push('mode-gated');
  if (has.creditHidesClosed) modifiers.push('hides-closed');
  else if (has.creditHidesScore) modifiers.push('hides-score');
  return makeArchetype(base, modifiers);
}

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
    // A gap exists if this rule starts after the current coverage ends.
    if (rule.startDate && rule.startDate > furthestEnd) return true;
    // Extend coverage.
    if (!rule.endDate) {
      furthestEnd = null;
    } else if (rule.endDate > furthestEnd) {
      furthestEnd = rule.endDate;
    }
  }

  return false;
}

export function classifyArchetype(rules: AssessmentAccessRuleJson[]): Archetype {
  rules = rules.filter((r) => !r.uids);
  const analyzed = rules.map(analyzeRule);
  const creditRules = analyzed.filter((r) => r.creditType !== 'none');
  const nonCreditRules = analyzed.filter((r) => r.creditType === 'none');

  const has = {
    prairieTest: analyzed.some((r) => r.isPrairieTest),
    password: analyzed.some((r) => r.hasPassword),
    timed: analyzed.some((r) => r.isTimed && r.creditType !== 'none'),
    bonusCredit: creditRules.some((r) => r.creditType === 'bonus'),
    fullCredit: creditRules.some((r) => r.creditType === 'full'),
    reducedCredit: creditRules.some((r) => r.creditType === 'reduced'),
    openCredit: creditRules.some((r) => r.isOpenCredit),
    viewing: nonCreditRules.some(
      (r) =>
        !r.isActive && r.hasDates && !r.isPrairieTest && !r.hasPassword && !r.hidesClosedAssessment,
    ),
    hiding: nonCreditRules.some(
      (r) => !r.isActive || r.hidesClosedAssessment || r.hidesClosedScore,
    ),
    modeGate: analyzed.some((r) => r.hasMode),
    creditModeGated: creditRules.some((r) => r.hasMode),
    creditHidesClosed: creditRules.some((r) => r.hidesClosedAssessment),
    creditHidesScore: creditRules.some((r) => r.hidesClosedScore),
  };

  // Detect gaps between access windows (ACCESS <-> NO ACCESS <-> ACCESS).
  // The modern format cannot represent non-contiguous access periods.
  if (hasAccessGaps(rules)) return makeArchetype('unclassified');

  const allNoOp = analyzed.every(
    (r) =>
      r.creditType === 'none' &&
      r.isActive &&
      !r.hasDates &&
      !r.isTimed &&
      !r.hasMode &&
      !r.isPrairieTest &&
      !r.hasPassword &&
      !r.hidesClosedAssessment &&
      !r.hidesClosedScore,
  );
  if (allNoOp) return makeArchetype('no-op');
  if (has.prairieTest) return makeArchetype('prairietest-exam');
  if (has.password) return makeArchetype('password-gated');
  if (has.timed) return withMods('timed-assessment', has);
  if (
    (has.fullCredit && has.reducedCredit) ||
    (has.bonusCredit && has.reducedCredit) ||
    (has.bonusCredit && has.fullCredit)
  ) {
    return withMods('declining-credit', has);
  }
  if ((has.fullCredit || has.bonusCredit) && creditRules.length === 1) {
    const base = has.viewing || has.hiding ? 'single-deadline-with-viewing' : 'single-deadline';
    return withMods(base, has);
  }
  if (has.fullCredit && creditRules.length > 1) return withMods('multi-deadline', has);
  if (has.reducedCredit && creditRules.length === 1) return withMods('single-reduced-credit', has);
  if (has.openCredit) return withMods('always-open', has);
  if (has.viewing && creditRules.length === 0) return withMods('view-only', has);
  if (has.hiding && creditRules.length === 0 && !has.viewing) return makeArchetype('hidden');
  if (has.modeGate && creditRules.length === 0) return makeArchetype('mode-gated');
  return makeArchetype('unclassified');
}

function migrateSingleDeadline(rules: AssessmentAccessRuleJson[]): {
  result: AccessControlJsonInput;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const creditRules = getCreditRules(rules);
  const creditRule = creditRules[0] as AssessmentAccessRuleJson | undefined;

  if (!creditRule) {
    errors.push('No credit rule found');
    return { result: {}, errors, warnings: [] };
  }

  const result: AccessControlJsonInput = {};
  const credit = creditRule.credit ?? 0;

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
    }
  }

  applyVisibilityMigration(result, rules);

  return { result, errors, warnings: [] };
}

function normalizeCreditDeadlines(
  rules: AssessmentAccessRuleJson[],
  deadlineKind: 'early' | 'late',
): { deadlines: { date: string; credit: number }[]; warnings: string[] } {
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
  const warnings =
    droppedCount > 0
      ? [
          `${droppedCount} ${deadlineKind} deadline${
            droppedCount === 1 ? '' : 's'
          } collapsed because higher-credit rules cover the same period.`,
        ]
      : [];

  return { deadlines: kept, warnings };
}

function migrateDecliningCredit(rules: AssessmentAccessRuleJson[]): {
  result: AccessControlJsonInput;
  errors: string[];
  warnings: string[];
} {
  const warnings: string[] = [];
  const creditRules = getCreditRules(rules);
  if (creditRules.length === 0) {
    return { result: {}, errors: ['No credit rules found'], warnings: [] };
  }

  const bonusRules = creditRules.filter((r) => (r.credit ?? 0) > 100);
  const fullRules = creditRules.filter((r) => (r.credit ?? 0) === 100);
  const reducedRules = creditRules.filter((r) => (r.credit ?? 0) > 0 && (r.credit ?? 0) < 100);

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
    const { deadlines, warnings: deadlineWarnings } = normalizeCreditDeadlines(bonusRules, 'early');
    warnings.push(...deadlineWarnings);
    if (deadlines.length > 0) result.dateControl!.earlyDeadlines = deadlines;
  }

  if (reducedRules.length > 0) {
    const { deadlines, warnings: deadlineWarnings } = normalizeCreditDeadlines(
      reducedRules,
      'late',
    );
    warnings.push(...deadlineWarnings);
    if (deadlines.length > 0) result.dateControl!.lateDeadlines = deadlines;
  }

  applyVisibilityMigration(result, rules);

  return { result, errors: [], warnings };
}

function migratePrairieTestExam(rules: AssessmentAccessRuleJson[]): {
  result: AccessControlJsonInput;
  errors: string[];
  warnings: string[];
} {
  const examRules = rules.filter((r) => r.examUuid);

  if (examRules.length === 0) {
    return { result: {}, errors: ['No examUuid rule found'], warnings: [] };
  }

  const exams = examRules.map((r) => ({ examUuid: r.examUuid! }));

  const result: AccessControlJsonInput = {
    integrations: {
      prairieTest: {
        exams,
      },
    },
  };

  const releaseDate = findReleaseDate(rules);
  if (releaseDate) {
    result.dateControl = {
      releaseDate,
      dueDate: null,
    };
  }

  applyVisibilityMigration(result, rules);

  return { result, errors: [], warnings: [] };
}

function migrateViewOnly(rules: AssessmentAccessRuleJson[]): {
  result: AccessControlJsonInput;
  errors: string[];
  warnings: string[];
} {
  const allDates = rules.map((r) => r.startDate).filter(Boolean) as string[];
  const releaseDate = allDates.sort()[0];

  const result: AccessControlJsonInput = {
    dateControl: {
      dueDate: null,
    },
  };
  if (releaseDate) result.dateControl!.releaseDate = releaseDate;

  return { result, errors: [], warnings: [] };
}

function migrateMultiDeadline(rules: AssessmentAccessRuleJson[]): {
  result: AccessControlJsonInput;
  errors: string[];
  warnings: string[];
} {
  const warnings: string[] = [];
  const creditRules = getCreditRules(rules);

  if (creditRules.length === 0) {
    return { result: {}, errors: ['No credit rules found'], warnings: [] };
  }

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
    warnings.push(
      `${creditRules.length} full-credit windows collapsed into single span: ${startDates[0]} to ${dueDate}`,
    );
  }

  const result: AccessControlJsonInput = {
    dateControl: {},
  };
  if (releaseDate) result.dateControl!.releaseDate = releaseDate;
  if (dueDate) result.dateControl!.dueDate = dueDate;

  applyVisibilityMigration(result, rules);

  return { result, errors: [], warnings };
}

function migratePasswordGated(rules: AssessmentAccessRuleJson[]): {
  result: AccessControlJsonInput;
  errors: string[];
  warnings: string[];
} {
  const passwordRule = rules.find((r) => r.password);

  if (!passwordRule) {
    return { result: {}, errors: ['No password rule found'], warnings: [] };
  }

  const result: AccessControlJsonInput = {
    dateControl: {
      password: passwordRule.password!,
    },
  };
  if (passwordRule.startDate) result.dateControl!.releaseDate = passwordRule.startDate;
  if (passwordRule.endDate) result.dateControl!.dueDate = passwordRule.endDate;

  applyVisibilityMigration(result, rules);

  return { result, errors: [], warnings: [] };
}

function migrateHidden(_rules: AssessmentAccessRuleJson[]): {
  result: AccessControlJsonInput;
  errors: string[];
  warnings: string[];
} {
  return {
    result: {},
    errors: [],
    warnings: [],
  };
}

function migrateNoOp(_rules: AssessmentAccessRuleJson[]): {
  result: AccessControlJsonInput;
  errors: string[];
  warnings: string[];
} {
  return {
    result: {},
    errors: [],
    warnings: ['No-op access rule — produces empty accessControl entry'],
  };
}

function migrateKnownAllowAccess(
  baseArchetype: BaseArchetype,
  rules: AssessmentAccessRuleJson[],
): { result: AccessControlJsonInput; errors: string[]; warnings: string[] } {
  switch (baseArchetype) {
    case 'single-deadline':
    case 'single-deadline-with-viewing':
    case 'single-reduced-credit':
    case 'timed-assessment':
      return migrateSingleDeadline(rules);

    case 'declining-credit':
      return migrateDecliningCredit(rules);

    case 'prairietest-exam':
      return migratePrairieTestExam(rules);

    case 'view-only':
      return migrateViewOnly(rules);

    case 'multi-deadline':
      return migrateMultiDeadline(rules);

    case 'password-gated':
      return migratePasswordGated(rules);

    case 'hidden':
      return migrateHidden(rules);

    case 'no-op':
      return migrateNoOp(rules);

    case 'always-open':
      return { result: {}, errors: [], warnings: [] };

    case 'mode-gated':
      return { result: {}, errors: ['Unsupported archetype: mode-gated'], warnings: [] };

    case 'unclassified':
      return { result: {}, errors: [UNCLASSIFIED_ACCESS_RULES_WARNING], warnings: [] };

    default:
      return assertNever(baseArchetype);
  }
}

export function migrateAllowAccess(
  archetype: Archetype | string,
  rules: AssessmentAccessRuleJson[],
): { result: AccessControlJsonInput; errors: string[]; warnings: string[] } {
  rules = rules.filter((r) => !r.uids);
  const parsedArchetype = typeof archetype === 'string' ? parseArchetype(archetype) : archetype;
  if (parsedArchetype == null) {
    const unsupportedLabel = typeof archetype === 'string' ? archetype : formatArchetype(archetype);
    return { result: {}, errors: [`Unsupported archetype: ${unsupportedLabel}`], warnings: [] };
  }

  return migrateKnownAllowAccess(parsedArchetype.base, rules);
}

function isMigratable(archetype: Archetype): boolean {
  return !NON_MIGRATABLE_ARCHETYPES.has(archetype.base);
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
): { json: string; errors: string[]; warnings: string[] } | null {
  const data = JSON.parse(jsonContent);
  const allowAccess = data.allowAccess as AssessmentAccessRuleJson[] | undefined;
  if (!allowAccess || !Array.isArray(allowAccess) || allowAccess.length === 0) return null;

  const rulesForMigration = allowAccess.filter((rule) => !rule.uids);
  const archetype =
    rulesForMigration.length > 0
      ? classifyArchetype(rulesForMigration)
      : makeArchetype('unclassified');
  const { result, errors, warnings } = migrateAllowAccess(archetype, rulesForMigration);
  const canMigrate = isMigratable(archetype);

  if (!canMigrate) return null;

  applyFallbackReleaseDate(result, fallbackReleaseDate);

  data.accessControl = [result];
  delete data.allowAccess;
  return { json: JSON.stringify(data), errors, warnings };
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

  const { archetype, canMigrate, hasUidRules, errors, warnings } =
    analyzeAllowAccessRules(allowAccess);

  return {
    tid,
    title: (data.title as string | undefined) ?? tid,
    type: (data.type as string | undefined) ?? 'unknown',
    archetype,
    canMigrate,
    ruleCount: allowAccess.length,
    hasUidRules,
    errors,
    warnings,
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
    allCanMigrate: assessments.every((a) => a.canMigrate),
  };
}

export async function applyMigrationToAssessmentFile(
  filePath: string,
  strategy: 'migrate' | 'keep' | 'wipe',
  preserveIncompatible: boolean,
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

  if (strategy === 'wipe') {
    delete data.allowAccess;
    const formatted = await formatJsonWithPrettier(JSON.stringify(data));
    await fs.writeFile(filePath, formatted);
    return;
  }

  if (strategy === 'keep') {
    return;
  }

  // strategy === 'migrate'
  const rulesForMigration = allowAccess.filter((rule) => !rule.uids);
  const archetype =
    rulesForMigration.length > 0
      ? classifyArchetype(rulesForMigration)
      : makeArchetype('unclassified');
  const { result } = migrateAllowAccess(archetype, rulesForMigration);
  const canMigrate = isMigratable(archetype);

  if (canMigrate) {
    applyFallbackReleaseDate(result, fallbackReleaseDate);
    data.accessControl = [result];
    delete data.allowAccess;
  } else if (!preserveIncompatible) {
    delete data.allowAccess;
  } else {
    // preserveIncompatible: keep allowAccess as-is
    return;
  }

  const formatted = await formatJsonWithPrettier(JSON.stringify(data));
  await fs.writeFile(filePath, formatted);
}
