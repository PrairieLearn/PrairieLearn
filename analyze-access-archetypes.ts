#!/usr/bin/env npx tsx
/**
 * Analyze PrairieLearn assessment access control patterns to identify archetypes.
 *
 * Usage: npx tsx src/analyze-access-archetypes.ts
 *
 * This script:
 * - Finds all infoAssessment.json files in repos/
 * - Classifies each allowAccess array as a whole into a semantic archetype
 * - Outputs ranked archetypes to console and reports/access-archetypes.json
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { execa } from 'execa';

interface AccessRule {
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
  [key: string]: unknown;
}

/**
 * Analyze a single rule and return a structured description of what it does.
 * This captures BOTH the credit structure AND modifiers like mode/showClosed.
 */
interface RuleAnalysis {
  // Primary function
  isPrairieTest: boolean;
  hasPassword: boolean;
  creditType: 'bonus' | 'full' | 'reduced' | 'none';
  hasDates: boolean; // has both startDate and endDate
  hasStartOnly: boolean; // has startDate but not endDate
  hasEndOnly: boolean; // has endDate but not startDate
  isActive: boolean;
  isTimed: boolean;
  // Modifiers
  hasMode: boolean;
  mode: string | undefined;
  hidesClosedAssessment: boolean;
  hidesClosedScore: boolean;
  isOpenCredit: boolean; // credit > 0 with no date bounds
}

function analyzeRule(rule: AccessRule): RuleAnalysis {
  const hasStart = 'startDate' in rule;
  const hasEnd = 'endDate' in rule;
  const credit = rule.credit ?? 0;
  const active = rule.active ?? true;

  let creditType: RuleAnalysis['creditType'] = 'none';
  if (credit > 100) creditType = 'bonus';
  else if (credit === 100) creditType = 'full';
  else if (credit > 0) creditType = 'reduced';

  return {
    isPrairieTest: !!rule.examUuid, // examUuid alone is sufficient; mode defaults to Exam
    hasPassword: !!rule.password,
    creditType,
    hasDates: hasStart && hasEnd,
    hasStartOnly: hasStart && !hasEnd,
    hasEndOnly: hasEnd && !hasStart,
    isActive: active,
    isTimed: !!rule.timeLimitMin,
    hasMode: !!rule.mode,
    mode: rule.mode,
    hidesClosedAssessment: (rule.showClosedAssessment ?? true) === false,
    hidesClosedScore: (rule.showClosedAssessmentScore ?? true) === false,
    isOpenCredit: credit > 0 && !hasStart && !hasEnd,
  };
}

interface ArraySummary {
  rules: RuleAnalysis[];
  // Presence flags
  hasPrairieTest: boolean;
  hasPassword: boolean;
  hasTimed: boolean;
  // Credit structure
  hasBonusCredit: boolean;
  hasFullCredit: boolean;
  hasReducedCredit: boolean;
  hasOpenCredit: boolean;
  creditRuleCount: number;
  // Viewing/hiding
  hasViewingRules: boolean; // rules with credit=0 that provide view access
  hasHidingRules: boolean; // rules that hide closed assessment or are inactive+hide
  // Modifiers (across ANY rule, including credit-granting ones)
  anyModeGate: boolean; // any rule has explicit mode
  anyHidesClosedAssessment: boolean; // any rule has showClosedAssessment:false
  anyHidesClosedScore: boolean; // any rule has showClosedAssessmentScore:false
  creditRuleHidesClosedAssessment: boolean; // a credit-granting rule hides closed assessment
  creditRuleHidesClosedScore: boolean; // a credit-granting rule hides closed score
  creditRuleModeGated: boolean; // a credit-granting rule has explicit mode
  // Special
  allNoOp: boolean;
  totalRules: number;
}

function summarizeArray(rules: AccessRule[]): ArraySummary {
  const analyzed = rules.map(analyzeRule);

  const creditRules = analyzed.filter((r) => r.creditType !== 'none');
  const nonCreditRules = analyzed.filter((r) => r.creditType === 'none');

  // A "viewing" rule: active, no credit, has some date or is always-on
  const viewingRules = nonCreditRules.filter(
    (r) => r.isActive && !r.isPrairieTest && !r.hasPassword && !r.hidesClosedAssessment,
  );

  // A "hiding" rule: inactive, or hides closed assessment, with no credit
  const hidingRules = nonCreditRules.filter(
    (r) => !r.isActive || r.hidesClosedAssessment || r.hidesClosedScore,
  );

  const isNoOp = (r: RuleAnalysis) =>
    r.creditType === 'none' &&
    r.isActive &&
    !r.hasDates &&
    !r.hasStartOnly &&
    !r.hasEndOnly &&
    !r.isTimed &&
    !r.hasMode &&
    !r.isPrairieTest &&
    !r.hasPassword &&
    !r.hidesClosedAssessment &&
    !r.hidesClosedScore;

  return {
    rules: analyzed,
    hasPrairieTest: analyzed.some((r) => r.isPrairieTest),
    hasPassword: analyzed.some((r) => r.hasPassword),
    hasTimed: analyzed.some((r) => r.isTimed && r.creditType !== 'none'),
    hasBonusCredit: creditRules.some((r) => r.creditType === 'bonus'),
    hasFullCredit: creditRules.some((r) => r.creditType === 'full'),
    hasReducedCredit: creditRules.some((r) => r.creditType === 'reduced'),
    hasOpenCredit: creditRules.some((r) => r.isOpenCredit),
    creditRuleCount: creditRules.length,
    hasViewingRules: viewingRules.length > 0,
    hasHidingRules: hidingRules.length > 0,
    anyModeGate: analyzed.some((r) => r.hasMode),
    anyHidesClosedAssessment: analyzed.some((r) => r.hidesClosedAssessment),
    anyHidesClosedScore: analyzed.some((r) => r.hidesClosedScore),
    creditRuleHidesClosedAssessment: creditRules.some((r) => r.hidesClosedAssessment),
    creditRuleHidesClosedScore: creditRules.some((r) => r.hidesClosedScore),
    creditRuleModeGated: creditRules.some((r) => r.hasMode),
    allNoOp: analyzed.every(isNoOp),
    totalRules: rules.length,
  };
}

/**
 * Classify the entire allowAccess array into a semantic archetype.
 *
 * The archetype name encodes:
 * 1. The primary credit structure (the core pattern)
 * 2. Important modifiers that affect migration (appended with hyphens)
 */
function classifyArchetype(rules: AccessRule[]): string {
  const s = summarizeArray(rules);

  // --- No-op ---
  if (s.allNoOp) {
    return 'no-op';
  }

  // --- PrairieTest exams ---
  if (s.hasPrairieTest) {
    return 'prairietest-exam';
  }

  // --- Password-gated ---
  if (s.hasPassword) {
    return 'password-gated';
  }

  // --- Timed assessment ---
  if (s.hasTimed) {
    return withModifiers('timed-assessment', s);
  }

  // --- Declining credit: multiple credit tiers ---
  if (
    (s.hasFullCredit && s.hasReducedCredit) ||
    (s.hasBonusCredit && s.hasReducedCredit) ||
    (s.hasBonusCredit && s.hasFullCredit)
  ) {
    return withModifiers('declining-credit', s);
  }

  // --- Single deadline: one credit window (full or bonus) ---
  if ((s.hasFullCredit || s.hasBonusCredit) && s.creditRuleCount === 1) {
    const base =
      s.hasViewingRules || s.hasHidingRules
        ? 'single-deadline-with-viewing'
        : 'single-deadline';
    return withModifiers(base, s);
  }

  // --- Multiple full-credit windows ---
  if (s.hasFullCredit && s.creditRuleCount > 1) {
    return withModifiers('multi-deadline', s);
  }

  // --- Single reduced-credit window ---
  if (s.hasReducedCredit && s.creditRuleCount === 1) {
    return withModifiers('single-reduced-credit', s);
  }

  // --- Always open ---
  if (s.hasOpenCredit) {
    return withModifiers('always-open', s);
  }

  // --- View-only ---
  if (s.hasViewingRules && s.creditRuleCount === 0) {
    return withModifiers('view-only', s);
  }

  // --- Hidden ---
  if (s.hasHidingRules && s.creditRuleCount === 0 && !s.hasViewingRules) {
    return 'hidden';
  }

  // --- Mode-gated only ---
  if (s.anyModeGate && s.creditRuleCount === 0) {
    return 'mode-gated';
  }

  return 'unclassified';
}

/**
 * Append modifier suffixes to the base archetype name when semantically important.
 */
function withModifiers(base: string, s: ArraySummary): string {
  const modifiers: string[] = [];

  // Mode gating on credit rules is semantically important
  if (s.creditRuleModeGated) {
    modifiers.push('mode-gated');
  } else if (s.anyModeGate && !s.hasViewingRules && !s.hasHidingRules) {
    // Mode gate is the only non-credit rule
    modifiers.push('mode-gated');
  }

  // showClosed flags on credit rules change the assessment behavior
  if (s.creditRuleHidesClosedAssessment) {
    modifiers.push('hides-closed');
  } else if (s.creditRuleHidesClosedScore) {
    modifiers.push('hides-score');
  }

  if (modifiers.length === 0) return base;
  return `${base} (${modifiers.join(', ')})`;
}

interface ArchetypeEntry {
  archetype: string;
  count: number;
  percentage: number;
  typeDistribution: Record<string, number>;
  examples: string[];
}

interface ArchetypeReport {
  summary: {
    totalAssessments: number;
    processed: number;
    excludedUids: number;
    parseErrors: number;
    noAccessRules: number;
  };
  archetypes: ArchetypeEntry[];
}

async function main() {
  console.log('\nDiscovering infoAssessment.json files...\n');

  // Step 1: Discover files
  const { stdout } = await execa('find', ['repos', '-name', 'infoAssessment.json']);
  const allPaths = stdout
    .split('\n')
    .filter((p) => p.includes('/courseInstances/') && p.includes('/assessments/'));

  console.log(`Found ${allPaths.length} assessment files\n`);

  // Step 2: Parse, filter, classify
  let parseErrors = 0;
  let noAccessRules = 0;
  let uidExcluded = 0;
  const archetypeMap = new Map<
    string,
    { count: number; typeDistribution: Record<string, number>; examples: string[] }
  >();
  const unclassifiedExamples: Array<{ path: string; rules: AccessRule[] }> = [];

  for (const filePath of allPaths) {
    let data: Record<string, unknown>;
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      data = JSON.parse(content);
    } catch {
      parseErrors++;
      continue;
    }

    const allowAccess = data.allowAccess as AccessRule[] | undefined;
    if (!allowAccess || !Array.isArray(allowAccess) || allowAccess.length === 0) {
      noAccessRules++;
      continue;
    }

    if (allowAccess.some((rule) => rule.uids)) {
      uidExcluded++;
      continue;
    }

    const archetype = classifyArchetype(allowAccess);
    const assessmentType = (data.type as string) ?? 'unknown';

    if (archetype === 'unclassified' && unclassifiedExamples.length < 15) {
      unclassifiedExamples.push({ path: filePath, rules: allowAccess });
    }

    const existing = archetypeMap.get(archetype);
    if (existing) {
      existing.count++;
      existing.typeDistribution[assessmentType] =
        (existing.typeDistribution[assessmentType] ?? 0) + 1;
      if (existing.examples.length < 5) {
        existing.examples.push(filePath);
      }
    } else {
      archetypeMap.set(archetype, {
        count: 1,
        typeDistribution: { [assessmentType]: 1 },
        examples: [filePath],
      });
    }
  }

  // Output
  const totalAssessments = allPaths.length;
  const processed = totalAssessments - parseErrors - noAccessRules - uidExcluded;

  const sortedArchetypes = [...archetypeMap.entries()].sort((a, b) => b[1].count - a[1].count);

  console.log('SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total assessments:      ${totalAssessments.toLocaleString()}`);
  console.log(
    `Processed:              ${processed.toLocaleString()} (${((processed / totalAssessments) * 100).toFixed(1)}%)`,
  );
  console.log(
    `Excluded (uid rules):   ${uidExcluded.toLocaleString()} (${((uidExcluded / totalAssessments) * 100).toFixed(1)}%)`,
  );
  console.log(
    `Parse errors:           ${parseErrors.toLocaleString()} (${((parseErrors / totalAssessments) * 100).toFixed(1)}%)`,
  );
  console.log(
    `No access rules:        ${noAccessRules.toLocaleString()} (${((noAccessRules / totalAssessments) * 100).toFixed(1)}%)`,
  );

  let cumulative = 0;
  console.log('\n');
  console.log('ACCESS CONTROL ARCHETYPES (ranked by frequency)');
  console.log('='.repeat(80));

  for (let i = 0; i < sortedArchetypes.length; i++) {
    const [archetype, info] = sortedArchetypes[i];
    const pct = (info.count / processed) * 100;
    cumulative += pct;
    const typeDist = Object.entries(info.typeDistribution)
      .sort((a, b) => b[1] - a[1])
      .map(([t, n]) => `${t}: ${n}`)
      .join(', ');

    console.log(`\n#${i + 1}  ${archetype}`);
    console.log(
      `    Count: ${info.count.toLocaleString()} (${pct.toFixed(1)}%)  [cumulative: ${cumulative.toFixed(1)}%]`,
    );
    console.log(`    Types: ${typeDist}`);
    console.log(`    Examples:`);
    for (const ex of info.examples.slice(0, 3)) {
      console.log(`      - ${ex}`);
    }
  }

  // Log unclassified
  if (unclassifiedExamples.length > 0) {
    console.log('\n\n');
    console.log('UNCLASSIFIED EXAMPLES (first 15)');
    console.log('='.repeat(80));
    for (const { path: p, rules } of unclassifiedExamples) {
      console.log(`\n  File: ${p}`);
      console.log(`  Rules: ${JSON.stringify(rules, null, 2)}`);
    }
  }

  // Write JSON report
  const report: ArchetypeReport = {
    summary: {
      totalAssessments,
      processed,
      excludedUids: uidExcluded,
      parseErrors,
      noAccessRules,
    },
    archetypes: sortedArchetypes.map(([archetype, info]) => ({
      archetype,
      count: info.count,
      percentage: parseFloat(((info.count / processed) * 100).toFixed(2)),
      typeDistribution: info.typeDistribution,
      examples: info.examples,
    })),
  };

  const reportPath = path.join('reports', 'access-archetypes.json');
  await fs.mkdir('reports', { recursive: true });
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`\n\nJSON report written to: ${reportPath}`);
}

main().catch(console.error);
