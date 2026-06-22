/**
 * Migration harness: scans all infoAssessment.json files, runs each through
 * migrateAllowAccess(), normalizes shapes and error signatures, and generates
 * an HTML report comparing old vs new for each unique (shape, outcome) pair.
 *
 * Run from the root of the repository with
 * `pnpm --dir apps/prairielearn exec tsx ../../scripts/migration-harness.mts`
 * or add `--inactive-window-summary` for a targeted summary of inactive legacy access rules.
 */

import * as fs from 'fs/promises';
import * as path from 'path';

import {
  INACTIVE_WINDOW_NOTE,
  migrateAllowAccess,
  normalizeRules,
} from '../apps/prairielearn/src/lib/assessment-access-control/migration.js';
import type { AssessmentAccessRuleJson } from '../apps/prairielearn/src/schemas/infoAssessment.js';

const REPOS_DIR = path.resolve(process.env.HOME!, 'git/python-upgrade-exploration/repos');
const OUTPUT_FILE = path.resolve(new URL('.', import.meta.url).pathname, 'migration-report.html');

const FALLBACK_RELEASE = '1900-01-01T00:00:00';

// ---------------------------------------------------------------------------
// 1. Scan all infoAssessment.json files
// ---------------------------------------------------------------------------

async function findInfoAssessmentFiles(baseDir: string): Promise<string[]> {
  const results: string[] = [];

  async function walk(dir: string) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    const promises: Promise<void>[] = [];
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        promises.push(walk(fullPath));
      } else if (entry.name === 'infoAssessment.json') {
        results.push(fullPath);
      }
    }
    await Promise.all(promises);
  }

  await walk(baseDir);
  return results;
}

// ---------------------------------------------------------------------------
// 2-4. Extract allowAccess, strip uid rules, normalize to shape
// ---------------------------------------------------------------------------

type NormalizedRule = Record<string, unknown>;

function normalizeRulesForHarness(rules: AssessmentAccessRuleJson[]): {
  shape: string;
  normalized: NormalizedRule[];
} {
  const filtered = normalizeRules(rules);
  if (filtered.length === 0) {
    return { shape: '[]', normalized: [] };
  }

  // Collect all concrete values for ordered tokenization
  const dates: string[] = [];
  const passwords: string[] = [];
  const examUuids: string[] = [];
  const timeLimits: number[] = [];
  const credits: number[] = [];

  for (const rule of filtered) {
    if (rule.startDate != null && !dates.includes(rule.startDate)) dates.push(rule.startDate);
    if (rule.endDate != null && !dates.includes(rule.endDate)) dates.push(rule.endDate);
    if (rule.password != null && !passwords.includes(rule.password)) passwords.push(rule.password);
    if (rule.examUuid != null && !examUuids.includes(rule.examUuid)) {
      examUuids.push(rule.examUuid);
    }
    if (rule.timeLimitMin != null && !timeLimits.includes(rule.timeLimitMin)) {
      timeLimits.push(rule.timeLimitMin);
    }
    if (rule.credit != null && rule.credit !== 0 && rule.credit !== 100) {
      if (!credits.includes(rule.credit)) credits.push(rule.credit);
    }
  }

  // Sort dates chronologically for ordered tokens
  dates.sort();
  // Sort credits descending (highest first)
  credits.sort((a, b) => b - a);

  const dateToken = (d: string) => `D${dates.indexOf(d)}`;
  const passwordToken = (p: string) => `P${passwords.indexOf(p)}`;
  const examUuidToken = (e: string) => `E${examUuids.indexOf(e)}`;
  const timeLimitToken = (t: number) => `T${timeLimits.indexOf(t)}`;
  const creditToken = (c: number) => {
    if (c === 0) return 0;
    if (c === 100) return 100;
    return `C${credits.indexOf(c)}`;
  };

  const normalized: NormalizedRule[] = filtered.map((rule) => {
    const out: NormalizedRule = {};

    // Process fields in a stable order
    if (rule.credit != null) out.credit = creditToken(rule.credit);
    if (rule.startDate != null) out.startDate = dateToken(rule.startDate);
    if (rule.endDate != null) out.endDate = dateToken(rule.endDate);
    if (rule.timeLimitMin != null) out.timeLimitMin = timeLimitToken(rule.timeLimitMin);
    if (rule.password != null) out.password = passwordToken(rule.password);
    if (rule.examUuid != null) out.examUuid = examUuidToken(rule.examUuid);
    if (rule.active != null) out.active = rule.active;
    if (rule.showClosedAssessment != null) out.showClosedAssessment = rule.showClosedAssessment;
    if (rule.showClosedAssessmentScore != null) {
      out.showClosedAssessmentScore = rule.showClosedAssessmentScore;
    }

    // mode, comment, role are stripped (not included)
    return out;
  });

  const shape = JSON.stringify(normalized);
  return { shape, normalized };
}

// ---------------------------------------------------------------------------
// Normalize error/note messages to stable signatures
// ---------------------------------------------------------------------------

/**
 * Replaces concrete values in error/note messages with placeholders so that
 * messages differing only in specific numbers or dates produce the same
 * signature. For example:
 *   "Credit of 120% cannot be..." -> "Credit of N% cannot be..."
 *   "3 full-credit windows collapsed into single span: 2024-01-01 to 2024-06-01"
 *     -> "N full-credit windows collapsed into single span: DATE to DATE"
 */
function normalizeMessage(msg: string): string {
  return (
    msg
      // ISO-ish dates (with or without time component)
      .replaceAll(/\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?/g, 'DATE')
      // Numbers (standalone, not inside words)
      .replaceAll(/\b\d+\b/g, 'N')
  );
}

function normalizeMessages(msgs: string[]): string {
  return msgs.map(normalizeMessage).join('|');
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OutcomeGroup {
  shape: string;
  normalized: NormalizedRule[];
  /** The outcome key: normalized errors + normalized notes */
  outcomeKey: string;
  representative: AssessmentAccessRuleJson[];
  migrationResult: ReturnType<typeof migrateAllowAccess>;
  count: number;
  filePaths: string[];
}

interface InactiveWindowClassification {
  singleInactiveRule: boolean;
  inactiveOnly: boolean;
  prairieTestPlusInactive: boolean;
  hasInactiveDates: boolean;
  hasInactiveTimeLimit: boolean;
  hasInactivePassword: boolean;
  hasInactiveExplicitZeroCredit: boolean;
  hasInactivePositiveCredit: boolean;
  hasInactiveShowClosedAssessment: boolean;
  hasInactiveShowClosedAssessmentScore: boolean;
  shape: string;
  normalized: NormalizedRule[];
}

interface InactiveWindowShapeGroup {
  count: number;
  classification: InactiveWindowClassification;
  filePaths: string[];
}

// ---------------------------------------------------------------------------
// Generate HTML report
// ---------------------------------------------------------------------------

function escapeHtml(s: string): string {
  return s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function generateHtml(
  results: OutcomeGroup[],
  totalFiles: number,
  totalWithAccess: number,
): string {
  // Sort by count descending
  results.sort((a, b) => b.count - a.count);

  const rows = results
    .map((r, i) => {
      const hasErrors = r.migrationResult.errors.length > 0;
      const errors =
        r.migrationResult.errors.length > 0
          ? `<div class="errors">${r.migrationResult.errors.map((e) => escapeHtml(e)).join('<br>')}</div>`
          : '';
      const notes =
        r.migrationResult.notes.length > 0
          ? `<div class="notes">${r.migrationResult.notes.map((n) => escapeHtml(n)).join('<br>')}</div>`
          : '';

      return `
      <tr id="shape-${i}">
        <td class="meta">
          <div class="count">${r.count} assessment${r.count === 1 ? '' : 's'}</div>
          <div class="status">${hasErrors ? 'Has errors' : 'OK'}</div>
          ${errors}${notes}
          <details><summary>Example files (${Math.min(3, r.filePaths.length)})</summary>
            <ul>${r.filePaths
              .slice(0, 3)
              .map((f) => `<li><code>${escapeHtml(f.replace(REPOS_DIR + '/', ''))}</code></li>`)
              .join('')}</ul>
          </details>
          <details><summary>Normalized shape</summary>
            <pre>${escapeHtml(JSON.stringify(r.normalized, null, 2))}</pre>
          </details>
        </td>
        <td class="old"><pre>${escapeHtml(JSON.stringify(r.representative, null, 2))}</pre></td>
        <td class="new"><pre>${escapeHtml(JSON.stringify(r.migrationResult.accessControl, null, 2))}</pre></td>
      </tr>`;
    })
    .join('\n');

  const errorCount = results.filter((r) => r.migrationResult.errors.length > 0).length;
  const assessmentsWithErrors = results
    .filter((r) => r.migrationResult.errors.length > 0)
    .reduce((sum, r) => sum + r.count, 0);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>allowAccess Migration Report</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
  h1 { margin-top: 0; }
  .summary { background: #fff; border-radius: 8px; padding: 16px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
  .summary .stat { display: inline-block; margin-right: 24px; }
  .summary .stat strong { font-size: 1.3em; }
  table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
  th { background: #333; color: #fff; padding: 12px; text-align: left; position: sticky; top: 0; z-index: 1; }
  td { padding: 12px; vertical-align: top; border-bottom: 1px solid #eee; }
  td.meta { width: 25%; }
  td.old, td.new { width: 37.5%; }
  pre { margin: 0; white-space: pre-wrap; word-break: break-word; font-size: 12px; max-height: 500px; overflow: auto; }
  .count { font-size: 1.2em; font-weight: bold; }
  .status { color: #0066cc; margin: 4px 0; font-weight: 600; }
  .errors { background: #fee; border-left: 3px solid #c33; padding: 4px 8px; margin: 4px 0; font-size: 0.9em; }
  .notes { background: #ffe; border-left: 3px solid #cc9; padding: 4px 8px; margin: 4px 0; font-size: 0.9em; }
  details { margin-top: 4px; font-size: 0.85em; }
  summary { cursor: pointer; color: #666; }
  tr:hover { background: #f8f8ff; }
  .filter-bar { margin-bottom: 12px; background: #fff; padding: 12px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
  .filter-bar label { margin-right: 16px; }
  .filter-bar select, .filter-bar input { padding: 4px 8px; }
</style>
</head>
<body>
<h1>allowAccess Migration Report</h1>
<div class="summary">
  <span class="stat"><strong>${totalFiles.toLocaleString()}</strong> total files scanned</span>
  <span class="stat"><strong>${totalWithAccess.toLocaleString()}</strong> with allowAccess</span>
  <span class="stat"><strong>${results.length}</strong> unique (shape, outcome) groups</span>
  <span class="stat"><strong>${errorCount}</strong> groups with errors (${assessmentsWithErrors.toLocaleString()} assessments)</span>
</div>
<div class="filter-bar">
  <label>
    <input type="checkbox" id="errorsOnly" onchange="filterRows()"> Errors only
  </label>
</div>
<table>
  <thead><tr><th>Info</th><th>Original allowAccess</th><th>Migrated accessControl</th></tr></thead>
  <tbody>
    ${rows}
  </tbody>
</table>
<script>
function filterRows() {
  const errOnly = document.getElementById('errorsOnly').checked;
  document.querySelectorAll('tbody tr').forEach(tr => {
    const errEl = tr.querySelector('.errors');
    let show = true;
    if (errOnly && !errEl) show = false;
    tr.style.display = show ? '' : 'none';
  });
}
</script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Inactive-only legacy rule summary
// ---------------------------------------------------------------------------

function classifyInactiveWindowRules(
  rules: AssessmentAccessRuleJson[],
): InactiveWindowClassification | null {
  const migrationResult = migrateAllowAccess(rules, FALLBACK_RELEASE);
  if (!migrationResult.notes.includes(INACTIVE_WINDOW_NOTE)) return null;

  const { shape, normalized } = normalizeRulesForHarness(rules);
  const normalizedRules = normalizeRules(rules);
  const inactiveRules = normalizedRules.filter((rule) => rule.active === false && !rule.examUuid);
  const nonPrairieTestRules = normalizedRules.filter((rule) => !rule.examUuid);

  return {
    singleInactiveRule: normalizedRules.length === 1 && inactiveRules.length === 1,
    inactiveOnly: inactiveRules.length > 0 && nonPrairieTestRules.length === inactiveRules.length,
    prairieTestPlusInactive:
      normalizedRules.some((rule) => rule.examUuid) && inactiveRules.length > 0,
    hasInactiveDates: inactiveRules.some((rule) => rule.startDate != null || rule.endDate != null),
    hasInactiveTimeLimit: inactiveRules.some((rule) => rule.timeLimitMin != null),
    hasInactivePassword: inactiveRules.some((rule) => rule.password != null),
    hasInactiveExplicitZeroCredit: inactiveRules.some((rule) => rule.credit === 0),
    hasInactivePositiveCredit: inactiveRules.some((rule) => (rule.credit ?? 0) > 0),
    hasInactiveShowClosedAssessment: inactiveRules.some(
      (rule) => rule.showClosedAssessment != null,
    ),
    hasInactiveShowClosedAssessmentScore: inactiveRules.some(
      (rule) => rule.showClosedAssessmentScore != null,
    ),
    shape,
    normalized,
  };
}

function incrementIf(map: Map<string, number>, key: string, condition: boolean) {
  if (!condition) return;
  map.set(key, (map.get(key) ?? 0) + 1);
}

function printCount(label: string, count: number, denominator: number) {
  const pct = denominator === 0 ? '0.00' : ((count / denominator) * 100).toFixed(2);
  console.log(`  ${label}: ${count.toLocaleString()} (${pct}%)`);
}

async function printInactiveWindowSummary(files: string[]) {
  const shapeGroups = new Map<string, InactiveWindowShapeGroup>();
  const counters = new Map<string, number>();
  let withAccess = 0;
  let processed = 0;
  let affected = 0;

  for (const filePath of files) {
    processed++;
    if (processed % 10000 === 0) {
      console.log(`  Processed ${processed}/${files.length}...`);
    }

    let content: string;
    try {
      content = await fs.readFile(filePath, 'utf-8');
    } catch {
      continue;
    }

    let json: any;
    try {
      json = JSON.parse(content);
    } catch {
      continue;
    }

    const allowAccess: AssessmentAccessRuleJson[] | undefined = json.allowAccess;
    if (!allowAccess || !Array.isArray(allowAccess) || allowAccess.length === 0) continue;
    withAccess++;

    const classification = classifyInactiveWindowRules(allowAccess);
    if (!classification) continue;

    affected++;
    incrementIf(counters, 'single inactive rule', classification.singleInactiveRule);
    incrementIf(counters, 'inactive-only after normalization', classification.inactiveOnly);
    incrementIf(
      counters,
      'PrairieTest plus inactive viewing rule',
      classification.prairieTestPlusInactive,
    );
    incrementIf(counters, 'inactive rule has start/end date', classification.hasInactiveDates);
    incrementIf(counters, 'inactive rule has timeLimitMin', classification.hasInactiveTimeLimit);
    incrementIf(counters, 'inactive rule has password', classification.hasInactivePassword);
    incrementIf(
      counters,
      'inactive rule has explicit credit 0',
      classification.hasInactiveExplicitZeroCredit,
    );
    incrementIf(
      counters,
      'inactive rule has positive credit',
      classification.hasInactivePositiveCredit,
    );
    incrementIf(
      counters,
      'inactive rule has showClosedAssessment',
      classification.hasInactiveShowClosedAssessment,
    );
    incrementIf(
      counters,
      'inactive rule has showClosedAssessmentScore',
      classification.hasInactiveShowClosedAssessmentScore,
    );

    const existing = shapeGroups.get(classification.shape);
    if (existing) {
      existing.count++;
      if (existing.filePaths.length < 3) existing.filePaths.push(filePath);
    } else {
      shapeGroups.set(classification.shape, {
        count: 1,
        classification,
        filePaths: [filePath],
      });
    }
  }

  console.log('\nInactive legacy access-rule summary');
  console.log(`${files.length.toLocaleString()} total files scanned`);
  console.log(`${withAccess.toLocaleString()} assessments with allowAccess`);
  printCount('affected assessments', affected, withAccess);
  console.log('\nBreakdown among affected assessments:');
  for (const [label, count] of [...counters.entries()].sort((a, b) => b[1] - a[1])) {
    printCount(label, count, affected);
  }

  console.log('\nTop affected normalized shapes:');
  const topGroups = [...shapeGroups.values()].sort((a, b) => b.count - a.count).slice(0, 20);
  topGroups.forEach((group, index) => {
    console.log(
      `\n#${index + 1}: ${group.count.toLocaleString()} assessment${group.count === 1 ? '' : 's'}`,
    );
    console.log(JSON.stringify(group.classification.normalized, null, 2));
    console.log('Example files:');
    for (const filePath of group.filePaths) {
      console.log(`  ${filePath.replace(REPOS_DIR + '/', '')}`);
    }
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('Scanning for infoAssessment.json files...');
  const files = await findInfoAssessmentFiles(REPOS_DIR);
  console.log(`Found ${files.length} files`);

  if (process.argv.includes('--inactive-window-summary')) {
    await printInactiveWindowSummary(files);
    return;
  }

  // Group by (shape, outcome) where outcome = normalized errors/notes.
  const groupMap = new Map<string, OutcomeGroup>();
  let withAccess = 0;
  let processed = 0;

  for (const filePath of files) {
    processed++;
    if (processed % 10000 === 0) {
      console.log(`  Processed ${processed}/${files.length}...`);
    }

    let content: string;
    try {
      content = await fs.readFile(filePath, 'utf-8');
    } catch {
      continue;
    }

    let json: any;
    try {
      json = JSON.parse(content);
    } catch {
      continue;
    }

    const allowAccess: AssessmentAccessRuleJson[] | undefined = json.allowAccess;
    if (!allowAccess || !Array.isArray(allowAccess) || allowAccess.length === 0) continue;

    withAccess++;

    const { shape, normalized } = normalizeRulesForHarness(allowAccess);

    // Pass raw allowAccess — migrateAllowAccess handles normalization internally.
    const migrationResult = migrateAllowAccess(allowAccess, FALLBACK_RELEASE);

    // Build outcome key from normalized error/note signatures
    const errorSig = normalizeMessages(migrationResult.errors);
    const noteSig = normalizeMessages(migrationResult.notes);
    const outcomeKey = `${shape}||${errorSig}||${noteSig}`;

    const existing = groupMap.get(outcomeKey);
    if (existing) {
      existing.count++;
      if (existing.filePaths.length < 3) {
        existing.filePaths.push(filePath);
      }
    } else {
      groupMap.set(outcomeKey, {
        shape,
        normalized,
        outcomeKey,
        representative: allowAccess,
        migrationResult,
        count: 1,
        filePaths: [filePath],
      });
    }
  }

  console.log(`\n${withAccess} assessments with allowAccess`);
  console.log(`${groupMap.size} unique (shape, outcome) groups\n`);

  const results = [...groupMap.values()];

  const errorCount = results.filter((r) => r.migrationResult.errors.length > 0).length;
  const assessmentsWithErrors = results
    .filter((r) => r.migrationResult.errors.length > 0)
    .reduce((sum, r) => sum + r.count, 0);
  console.log(
    `\n${errorCount} groups with migration errors (${assessmentsWithErrors} assessments)`,
  );

  // Generate HTML report
  console.log('\nGenerating HTML report...');
  const html = generateHtml(results, files.length, withAccess);
  await fs.writeFile(OUTPUT_FILE, html, 'utf-8');
  console.log(`Report written to ${OUTPUT_FILE}`);
}

await main();
