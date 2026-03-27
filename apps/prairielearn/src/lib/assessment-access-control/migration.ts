/**
 * Migration library for converting legacy allowAccess arrays to modern accessControl format.
 */

import * as fs from 'fs/promises';
import * as path from 'path';

import type { AccessControlJsonInput } from '../../schemas/accessControl.js';
import type { AssessmentAccessRuleJson } from '../../schemas/infoAssessment.js';
import { discoverInfoDirs } from '../discover-info-dirs.js';
import { formatJsonWithPrettier } from '../prettier.js';

export interface AssessmentMigrationAnalysis {
  tid: string;
  title: string;
  type: string;
  archetype: string;
  canMigrate: boolean;
  ruleCount: number;
  hasUidRules: boolean;
}

interface CourseInstanceMigrationAnalysis {
  assessments: AssessmentMigrationAnalysis[];
  hasLegacyRules: boolean;
  allCanMigrate: boolean;
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

function findReleaseDate(rules: AssessmentAccessRuleJson[]): string | undefined {
  const visibilityDates = getVisibilityRules(rules)
    .map((r) => r.startDate)
    .filter(Boolean) as string[];
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
  return result;
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
  base: string,
  has: {
    creditModeGated: boolean;
    modeGate: boolean;
    viewing: boolean;
    hiding: boolean;
    creditHidesClosed: boolean;
    creditHidesScore: boolean;
  },
): string {
  const mods: string[] = [];
  if (has.creditModeGated) mods.push('mode-gated');
  else if (has.modeGate && !has.viewing && !has.hiding) mods.push('mode-gated');
  if (has.creditHidesClosed) mods.push('hides-closed');
  else if (has.creditHidesScore) mods.push('hides-score');
  if (mods.length === 0) return base;
  return `${base} (${mods.join(', ')})`;
}

export function classifyArchetype(rules: AssessmentAccessRuleJson[]): string {
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
  if (allNoOp) return 'no-op';
  if (has.prairieTest) return 'prairietest-exam';
  if (has.password) return 'password-gated';
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
  if (has.hiding && creditRules.length === 0 && !has.viewing) return 'hidden';
  if (has.modeGate && creditRules.length === 0) return 'mode-gated';
  return 'unclassified';
}

function migrateSingleDeadline(rules: AssessmentAccessRuleJson[]): {
  result: AccessControlJsonInput;
  warnings: string[];
} {
  const warnings: string[] = [];
  const creditRules = getCreditRules(rules);
  const creditRule = creditRules[0] as AssessmentAccessRuleJson | undefined;

  if (!creditRule) {
    warnings.push('No credit rule found');
    return { result: {}, warnings };
  }

  const result: AccessControlJsonInput = {};

  const releaseDate = findReleaseDate(rules);
  if (creditRule.startDate || creditRule.endDate || releaseDate) {
    result.dateControl = {};
    if (releaseDate) result.dateControl.releaseDate = releaseDate;
    if (creditRule.endDate) result.dateControl.dueDate = creditRule.endDate;
    if (creditRule.timeLimitMin) result.dateControl.durationMinutes = creditRule.timeLimitMin;
  }

  const afterComplete = buildAfterComplete(rules);
  if (afterComplete) result.afterComplete = afterComplete;

  return { result, warnings };
}

function migrateDecliningCredit(rules: AssessmentAccessRuleJson[]): {
  result: AccessControlJsonInput;
  warnings: string[];
} {
  const warnings: string[] = [];
  const creditRules = getCreditRules(rules);
  if (creditRules.length === 0) {
    warnings.push('No credit rules found');
    return { result: {}, warnings };
  }

  const bonusRules = creditRules.filter((r) => (r.credit ?? 0) > 100);
  const fullRules = creditRules.filter((r) => (r.credit ?? 0) === 100);
  const reducedRules = creditRules.filter((r) => (r.credit ?? 0) > 0 && (r.credit ?? 0) < 100);

  const primaryRules = fullRules.length > 0 ? fullRules : bonusRules;
  const primaryEndDates = primaryRules
    .map((r) => r.endDate)
    .filter(Boolean)
    .sort() as string[];
  const dueDate = primaryEndDates[primaryEndDates.length - 1];

  const releaseDate = findReleaseDate(rules);

  const result: AccessControlJsonInput = {
    dateControl: {},
  };
  if (releaseDate) result.dateControl!.releaseDate = releaseDate;
  if (dueDate) result.dateControl!.dueDate = dueDate;

  if (bonusRules.length > 0 && fullRules.length > 0) {
    result.dateControl!.earlyDeadlines = bonusRules
      .filter((r) => r.endDate)
      .map((r) => ({ date: r.endDate!, credit: r.credit! }));
  }

  if (reducedRules.length > 0) {
    result.dateControl!.lateDeadlines = reducedRules
      .filter((r) => r.endDate)
      .sort((a, b) => (b.credit ?? 0) - (a.credit ?? 0))
      .map((r) => ({ date: r.endDate!, credit: r.credit! }));
  }

  const afterComplete = buildAfterComplete(rules);
  if (afterComplete) result.afterComplete = afterComplete;

  return { result, warnings };
}

function migratePrairieTestExam(rules: AssessmentAccessRuleJson[]): {
  result: AccessControlJsonInput;
  warnings: string[];
} {
  const warnings: string[] = [];
  const examRules = rules.filter((r) => r.examUuid);

  if (examRules.length === 0) {
    warnings.push('No examUuid rule found');
    return { result: {}, warnings };
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

  const afterComplete = buildAfterComplete(rules);
  if (afterComplete) result.afterComplete = afterComplete;

  return { result, warnings };
}

function migrateViewOnly(rules: AssessmentAccessRuleJson[]): {
  result: AccessControlJsonInput;
  warnings: string[];
} {
  const warnings: string[] = [];
  const allDates = rules.map((r) => r.startDate).filter(Boolean) as string[];
  const releaseDate = allDates.sort()[0];

  const result: AccessControlJsonInput = {
    dateControl: {
      dueDate: null,
    },
  };
  if (releaseDate) result.dateControl!.releaseDate = releaseDate;

  return { result, warnings };
}

function migrateMultiDeadline(rules: AssessmentAccessRuleJson[]): {
  result: AccessControlJsonInput;
  warnings: string[];
} {
  const warnings: string[] = [];
  const creditRules = getCreditRules(rules);

  if (creditRules.length === 0) {
    warnings.push('No credit rules found');
    return { result: {}, warnings };
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

  const afterComplete = buildAfterComplete(rules);
  if (afterComplete) result.afterComplete = afterComplete;

  return { result, warnings };
}

function migratePasswordGated(rules: AssessmentAccessRuleJson[]): {
  result: AccessControlJsonInput;
  warnings: string[];
} {
  const warnings: string[] = [];
  const passwordRule = rules.find((r) => r.password);

  if (!passwordRule) {
    warnings.push('No password rule found');
    return { result: {}, warnings };
  }

  const result: AccessControlJsonInput = {
    dateControl: {
      password: passwordRule.password!,
    },
  };
  if (passwordRule.startDate) result.dateControl!.releaseDate = passwordRule.startDate;
  if (passwordRule.endDate) result.dateControl!.dueDate = passwordRule.endDate;

  const afterComplete = buildAfterComplete(rules);
  if (afterComplete) result.afterComplete = afterComplete;

  return { result, warnings };
}

function migrateHidden(_rules: AssessmentAccessRuleJson[]): {
  result: AccessControlJsonInput;
  warnings: string[];
} {
  return {
    result: {},
    warnings: [],
  };
}

function migrateNoOp(_rules: AssessmentAccessRuleJson[]): {
  result: AccessControlJsonInput;
  warnings: string[];
} {
  return {
    result: {},
    warnings: ['No-op access rule — produces empty accessControl entry'],
  };
}

export function migrateAllowAccess(
  archetype: string,
  rules: AssessmentAccessRuleJson[],
): { result: AccessControlJsonInput; warnings: string[] } {
  rules = rules.filter((r) => !r.uids);
  const base = archetype.replace(/\s*\(.*\)$/, '');

  switch (base) {
    case 'single-deadline':
    case 'single-deadline-with-viewing':
    case 'single-deadline-mode-gated':
    case 'single-reduced-credit':
    case 'timed-assessment':
      return migrateSingleDeadline(rules);

    case 'declining-credit':
      return migrateDecliningCredit(rules);

    case 'prairietest-exam':
      return migratePrairieTestExam(rules);

    case 'view-only':
    case 'view-only-mode-gated':
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
      return { result: {}, warnings: [] };

    default:
      return { result: {}, warnings: [`Unsupported archetype: ${archetype}`] };
  }
}

function isMigratable(archetype: string, warnings: string[]): boolean {
  return archetype !== 'unclassified' && !warnings.some((w) => w.startsWith('Unsupported'));
}

/** Migrates assessment JSON from legacy allowAccess to modern accessControl format. */
export function migrateAssessmentJson(
  jsonContent: string,
): { json: string; warnings: string[] } | null {
  const data = JSON.parse(jsonContent);
  const allowAccess = data.allowAccess as AssessmentAccessRuleJson[] | undefined;
  if (!allowAccess || !Array.isArray(allowAccess) || allowAccess.length === 0) return null;

  const rulesForMigration = allowAccess.filter((rule) => !rule.uids);
  const archetype =
    rulesForMigration.length > 0 ? classifyArchetype(rulesForMigration) : 'unclassified';
  const { result, warnings } = migrateAllowAccess(archetype, rulesForMigration);
  const canMigrate = isMigratable(archetype, warnings);

  if (!canMigrate) return null;

  data.accessControl = [result];
  delete data.allowAccess;
  return { json: JSON.stringify(data), warnings };
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

  const hasUidRules = allowAccess.some((rule) => rule.uids);
  const rulesForClassification = allowAccess.filter((rule) => !rule.uids);

  const archetype =
    rulesForClassification.length > 0 ? classifyArchetype(rulesForClassification) : 'unclassified';

  const { warnings } = migrateAllowAccess(archetype, rulesForClassification);
  const canMigrate = isMigratable(archetype, warnings);

  return {
    tid,
    title: (data.title as string | undefined) ?? tid,
    type: (data.type as string | undefined) ?? 'unknown',
    archetype,
    canMigrate,
    ruleCount: allowAccess.length,
    hasUidRules,
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
    rulesForMigration.length > 0 ? classifyArchetype(rulesForMigration) : 'unclassified';
  const { result, warnings } = migrateAllowAccess(archetype, rulesForMigration);
  const canMigrate = isMigratable(archetype, warnings);

  if (canMigrate) {
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
