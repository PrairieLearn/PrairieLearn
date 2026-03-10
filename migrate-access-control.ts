#!/usr/bin/env npx tsx
/**
 * Migrate old allowAccess arrays to new accessControl schema.
 *
 * Usage: npx tsx src/migrate-access-control.ts [--dry-run]
 *
 * Maps the top 15 archetypes (covering 98% of non-uid assessments) from the
 * old allowAccess rule-array format to the new AccessControlJsonSchema format.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { execa } from 'execa';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OldAccessRule {
  comment?: string;
  uids?: string[];
  startDate?: string;
  endDate?: string;
  mode?: string;
  password?: string;
  examUuid?: string;
  active?: boolean;
  credit?: number;
  showClosedAssessment?: boolean;
  showClosedAssessmentScore?: boolean;
  timeLimitMin?: number;
  role?: string;
}

interface DeadlineEntry {
  date: string;
  credit: number;
}

interface NewAccessControl {
  name?: string;
  labels?: string[];
  enabled?: boolean;
  blockAccess?: boolean | null;
  listBeforeRelease?: boolean | null;
  dateControl?: {
    enabled?: boolean;
    releaseDate?: string;
    dueDate?: string | null;
    earlyDeadlines?: DeadlineEntry[] | null;
    lateDeadlines?: DeadlineEntry[] | null;
    afterLastDeadline?: {
      allowSubmissions?: boolean;
      credit?: number;
    };
    durationMinutes?: number;
    password?: string | null;
  };
  integrations?: {
    prairieTest?: {
      enabled?: boolean;
      exams?: Array<{ examUuid: string; readOnly?: boolean }>;
    };
  };
  afterComplete?: {
    hideQuestions?: boolean;
    showQuestionsAgainDate?: string;
    hideQuestionsAgainDate?: string;
    hideScore?: boolean;
    showScoreAgainDate?: string;
  };
}

interface MigrationResult {
  archetype: string;
  filePath: string;
  oldAllowAccess: OldAccessRule[];
  newAccessControl: NewAccessControl[];
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Get the credit-granting rules (credit > 0), sorted by credit desc, then startDate asc. */
function getCreditRules(rules: OldAccessRule[]): OldAccessRule[] {
  return rules
    .filter((r) => (r.credit ?? 0) > 0)
    .sort((a, b) => {
      const creditDiff = (b.credit ?? 0) - (a.credit ?? 0);
      if (creditDiff !== 0) return creditDiff;
      return (a.startDate ?? '').localeCompare(b.startDate ?? '');
    });
}

/** Get the visibility rules (active:false rules used for schedule visibility). */
function getVisibilityRules(rules: OldAccessRule[]): OldAccessRule[] {
  return rules.filter((r) => (r.active ?? true) === false && !r.examUuid && !r.password);
}

/**
 * Find the release date: the earliest startDate among visibility rules
 * (active:false), falling back to the earliest credit rule startDate.
 */
function findReleaseDate(rules: OldAccessRule[]): string | undefined {
  // Prefer active:false rules (these are schedule visibility rules)
  const visibilityDates = getVisibilityRules(rules)
    .map((r) => r.startDate)
    .filter(Boolean) as string[];
  if (visibilityDates.length > 0) return visibilityDates.sort()[0];

  // Fall back to earliest credit rule start
  const creditDates = getCreditRules(rules)
    .map((r) => r.startDate)
    .filter(Boolean) as string[];
  if (creditDates.length > 0) return creditDates.sort()[0];

  return undefined;
}

/** Check if any rule (including credit rules) hides the closed assessment. */
function anyHidesClosedAssessment(rules: OldAccessRule[]): boolean {
  return rules.some((r) => r.showClosedAssessment === false);
}

/** Check if any rule (including credit rules) hides the closed score. */
function anyHidesClosedScore(rules: OldAccessRule[]): boolean {
  return rules.some((r) => r.showClosedAssessmentScore === false);
}

/** Build afterComplete section from showClosed flags. */
function buildAfterComplete(rules: OldAccessRule[]): NewAccessControl['afterComplete'] | undefined {
  const hidesAssessment = anyHidesClosedAssessment(rules);
  const hidesScore = anyHidesClosedScore(rules);
  if (!hidesAssessment && !hidesScore) return undefined;

  const result: NewAccessControl['afterComplete'] = {};
  if (hidesAssessment) result.hideQuestions = true;
  if (hidesScore) result.hideScore = true;
  return result;
}

// ---------------------------------------------------------------------------
// Archetype classification (reused from analyze script)
// ---------------------------------------------------------------------------

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

function analyzeRule(rule: OldAccessRule): RuleAnalysis {
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

function classifyArchetype(rules: OldAccessRule[]): string {
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
      (r) => r.isActive && !r.isPrairieTest && !r.hasPassword && !r.hidesClosedAssessment,
    ),
    hiding: nonCreditRules.some((r) => !r.isActive || r.hidesClosedAssessment || r.hidesClosedScore),
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
  )
    return withMods('declining-credit', has);
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

function withMods(
  base: string,
  has: { creditModeGated: boolean; modeGate: boolean; viewing: boolean; hiding: boolean; creditHidesClosed: boolean; creditHidesScore: boolean },
): string {
  const mods: string[] = [];
  if (has.creditModeGated) mods.push('mode-gated');
  else if (has.modeGate && !has.viewing && !has.hiding) mods.push('mode-gated');
  if (has.creditHidesClosed) mods.push('hides-closed');
  else if (has.creditHidesScore) mods.push('hides-score');
  if (mods.length === 0) return base;
  return `${base} (${mods.join(', ')})`;
}

// ---------------------------------------------------------------------------
// Migration functions — one per archetype family
// ---------------------------------------------------------------------------

function migrateSingleDeadline(rules: OldAccessRule[]): { result: NewAccessControl; warnings: string[] } {
  const warnings: string[] = [];
  const creditRules = getCreditRules(rules);
  const creditRule = creditRules[0];

  if (!creditRule) {
    warnings.push('No credit rule found');
    return { result: {}, warnings };
  }

  const result: NewAccessControl = {};

  // dateControl
  const releaseDate = findReleaseDate(rules);
  if (creditRule.startDate || creditRule.endDate || releaseDate) {
    result.dateControl = { enabled: true };
    if (releaseDate) result.dateControl.releaseDate = releaseDate;
    if (creditRule.endDate) result.dateControl.dueDate = creditRule.endDate;
    if (creditRule.timeLimitMin) result.dateControl.durationMinutes = creditRule.timeLimitMin;
  }

  // afterComplete
  const afterComplete = buildAfterComplete(rules);
  if (afterComplete) result.afterComplete = afterComplete;

  return { result, warnings };
}

function migrateDecliningCredit(rules: OldAccessRule[]): { result: NewAccessControl; warnings: string[] } {
  const warnings: string[] = [];
  const creditRules = getCreditRules(rules);
  if (creditRules.length === 0) {
    warnings.push('No credit rules found');
    return { result: {}, warnings };
  }

  // Separate into bonus (>100), full (100), and reduced (<100) tiers
  const bonusRules = creditRules.filter((r) => (r.credit ?? 0) > 100);
  const fullRules = creditRules.filter((r) => (r.credit ?? 0) === 100);
  const reducedRules = creditRules.filter((r) => (r.credit ?? 0) > 0 && (r.credit ?? 0) < 100);

  // The primary deadline is the end of the last full-credit rule (or last bonus if no full)
  const primaryRules = fullRules.length > 0 ? fullRules : bonusRules;
  const primaryEndDates = primaryRules
    .map((r) => r.endDate)
    .filter(Boolean)
    .sort() as string[];
  const dueDate = primaryEndDates[primaryEndDates.length - 1];

  const releaseDate = findReleaseDate(rules);

  const result: NewAccessControl = {
    dateControl: {
      enabled: true,
    },
  };
  if (releaseDate) result.dateControl!.releaseDate = releaseDate;
  if (dueDate) result.dateControl!.dueDate = dueDate;

  // Early deadlines (bonus credit before the due date)
  if (bonusRules.length > 0 && fullRules.length > 0) {
    result.dateControl!.earlyDeadlines = bonusRules
      .filter((r) => r.endDate)
      .map((r) => ({ date: r.endDate!, credit: r.credit! }));
  }

  // Late deadlines (reduced credit after the due date)
  if (reducedRules.length > 0) {
    result.dateControl!.lateDeadlines = reducedRules
      .filter((r) => r.endDate)
      .sort((a, b) => (b.credit ?? 0) - (a.credit ?? 0))
      .map((r) => ({ date: r.endDate!, credit: r.credit! }));
  }

  // afterComplete
  const afterComplete = buildAfterComplete(rules);
  if (afterComplete) result.afterComplete = afterComplete;

  return { result, warnings };
}

function migratePrairieTestExam(rules: OldAccessRule[]): { result: NewAccessControl; warnings: string[] } {
  const warnings: string[] = [];
  const examRules = rules.filter((r) => r.examUuid);

  if (examRules.length === 0) {
    warnings.push('No examUuid rule found');
    return { result: {}, warnings };
  }

  const exams = examRules.map((r) => ({ examUuid: r.examUuid! }));

  const result: NewAccessControl = {
    integrations: {
      prairieTest: {
        enabled: true,
        exams,
      },
    },
  };

  // If there's a visibility rule with dates, set releaseDate
  const releaseDate = findReleaseDate(rules);
  if (releaseDate) {
    result.dateControl = {
      enabled: true,
      releaseDate,
      dueDate: null,
    };
  }

  // afterComplete
  const afterComplete = buildAfterComplete(rules);
  if (afterComplete) result.afterComplete = afterComplete;

  return { result, warnings };
}

function migrateViewOnly(rules: OldAccessRule[]): { result: NewAccessControl; warnings: string[] } {
  const warnings: string[] = [];
  const allDates = rules.map((r) => r.startDate).filter(Boolean) as string[];
  const releaseDate = allDates.sort()[0];

  const result: NewAccessControl = {
    dateControl: {
      enabled: true,
      dueDate: null,
    },
  };
  if (releaseDate) result.dateControl!.releaseDate = releaseDate;

  return { result, warnings };
}

function migrateMultiDeadline(rules: OldAccessRule[]): { result: NewAccessControl; warnings: string[] } {
  const warnings: string[] = [];
  const creditRules = getCreditRules(rules);

  if (creditRules.length === 0) {
    warnings.push('No credit rules found');
    return { result: {}, warnings };
  }

  // Multiple full-credit windows: use the overall span
  const startDates = creditRules.map((r) => r.startDate).filter(Boolean).sort() as string[];
  const endDates = creditRules.map((r) => r.endDate).filter(Boolean).sort() as string[];
  const releaseDate = findReleaseDate(rules) ?? startDates[0];
  const dueDate = endDates[endDates.length - 1];

  if (creditRules.length > 1) {
    warnings.push(
      `${creditRules.length} full-credit windows collapsed into single span: ${startDates[0]} to ${dueDate}`,
    );
  }

  const result: NewAccessControl = {
    dateControl: {
      enabled: true,
    },
  };
  if (releaseDate) result.dateControl!.releaseDate = releaseDate;
  if (dueDate) result.dateControl!.dueDate = dueDate;

  // afterComplete
  const afterComplete = buildAfterComplete(rules);
  if (afterComplete) result.afterComplete = afterComplete;

  return { result, warnings };
}

function migratePasswordGated(rules: OldAccessRule[]): { result: NewAccessControl; warnings: string[] } {
  const warnings: string[] = [];
  const passwordRule = rules.find((r) => r.password);

  if (!passwordRule) {
    warnings.push('No password rule found');
    return { result: {}, warnings };
  }

  const result: NewAccessControl = {
    dateControl: {
      enabled: true,
      password: passwordRule.password!,
    },
  };
  if (passwordRule.startDate) result.dateControl!.releaseDate = passwordRule.startDate;
  if (passwordRule.endDate) result.dateControl!.dueDate = passwordRule.endDate;

  // afterComplete
  const afterComplete = buildAfterComplete(rules);
  if (afterComplete) result.afterComplete = afterComplete;

  return { result, warnings };
}

function migrateHidden(_rules: OldAccessRule[]): { result: NewAccessControl; warnings: string[] } {
  return {
    result: { blockAccess: true },
    warnings: [],
  };
}

function migrateNoOp(_rules: OldAccessRule[]): { result: NewAccessControl; warnings: string[] } {
  return {
    result: {},
    warnings: ['No-op access rule — produces empty accessControl entry'],
  };
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

function migrateAllowAccess(
  archetype: string,
  rules: OldAccessRule[],
): { result: NewAccessControl; warnings: string[] } {
  // Strip modifiers to get the base archetype
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

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  console.log('\nDiscovering infoAssessment.json files...\n');

  const { stdout } = await execa('find', ['repos', '-name', 'infoAssessment.json']);
  const allPaths = stdout
    .split('\n')
    .filter((p) => p.includes('/courseInstances/') && p.includes('/assessments/'));

  console.log(`Found ${allPaths.length} assessment files\n`);

  let processed = 0;
  let migrated = 0;
  let skippedUids = 0;
  let skippedNoAccess = 0;
  let parseErrors = 0;
  let unsupported = 0;
  let withWarnings = 0;
  const archetypeCounts = new Map<string, { total: number; migrated: number }>();
  const allWarnings: Array<{ path: string; archetype: string; warnings: string[] }> = [];
  const sampleResults: MigrationResult[] = [];

  for (const filePath of allPaths) {
    let data: Record<string, unknown>;
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      data = JSON.parse(content);
    } catch {
      parseErrors++;
      continue;
    }

    const allowAccess = data.allowAccess as OldAccessRule[] | undefined;
    if (!allowAccess || !Array.isArray(allowAccess) || allowAccess.length === 0) {
      skippedNoAccess++;
      continue;
    }

    if (allowAccess.some((rule) => rule.uids)) {
      skippedUids++;
      continue;
    }

    processed++;
    const archetype = classifyArchetype(allowAccess);
    const entry = archetypeCounts.get(archetype) ?? { total: 0, migrated: 0 };
    entry.total++;

    const { result, warnings } = migrateAllowAccess(archetype, allowAccess);

    if (warnings.some((w) => w.startsWith('Unsupported'))) {
      unsupported++;
      archetypeCounts.set(archetype, entry);
      continue;
    }

    entry.migrated++;
    archetypeCounts.set(archetype, entry);
    migrated++;

    if (warnings.length > 0) {
      withWarnings++;
      allWarnings.push({ path: filePath, archetype, warnings });
    }

    // Collect samples (first 2 per archetype)
    const sampleCount = sampleResults.filter((s) => s.archetype === archetype).length;
    if (sampleCount < 2) {
      sampleResults.push({
        archetype,
        filePath,
        oldAllowAccess: allowAccess,
        newAccessControl: [result],
        warnings,
      });
    }
  }

  // Output
  console.log('MIGRATION SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total files:            ${allPaths.length.toLocaleString()}`);
  console.log(`Processed:              ${processed.toLocaleString()}`);
  console.log(`Migrated:               ${migrated.toLocaleString()}`);
  console.log(`Skipped (uids):         ${skippedUids.toLocaleString()}`);
  console.log(`Skipped (no access):    ${skippedNoAccess.toLocaleString()}`);
  console.log(`Parse errors:           ${parseErrors.toLocaleString()}`);
  console.log(`Unsupported archetype:  ${unsupported.toLocaleString()}`);
  console.log(`With warnings:          ${withWarnings.toLocaleString()}`);

  console.log('\n\nPER-ARCHETYPE COUNTS');
  console.log('='.repeat(80));
  const sorted = [...archetypeCounts.entries()].sort((a, b) => b[1].total - a[1].total);
  for (const [arch, { total, migrated: m }] of sorted) {
    console.log(`  ${arch}: ${m}/${total} migrated`);
  }

  console.log('\n\nSAMPLE MIGRATIONS');
  console.log('='.repeat(80));
  for (const sample of sampleResults) {
    console.log(`\n--- ${sample.archetype} ---`);
    console.log(`File: ${sample.filePath}`);
    console.log(`Old allowAccess:`);
    console.log(JSON.stringify(sample.oldAllowAccess, null, 2));
    console.log(`New accessControl:`);
    console.log(JSON.stringify(sample.newAccessControl, null, 2));
    if (sample.warnings.length > 0) {
      console.log(`Warnings: ${sample.warnings.join('; ')}`);
    }
  }

  if (allWarnings.length > 0) {
    console.log('\n\nWARNINGS (first 20)');
    console.log('='.repeat(80));
    for (const { path: p, archetype, warnings } of allWarnings.slice(0, 20)) {
      console.log(`  ${p} [${archetype}]: ${warnings.join('; ')}`);
    }
    if (allWarnings.length > 20) {
      console.log(`  ... and ${allWarnings.length - 20} more`);
    }
  }

  // Write report
  const reportPath = path.join('reports', 'migration-preview.json');
  await fs.mkdir('reports', { recursive: true });
  await fs.writeFile(
    reportPath,
    JSON.stringify({ samples: sampleResults, warnings: allWarnings }, null, 2),
    'utf-8',
  );
  console.log(`\n\nReport written to: ${reportPath}`);
}

main().catch(console.error);
