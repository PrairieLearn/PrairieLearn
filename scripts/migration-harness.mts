/**
 * Migration harness: scans all infoAssessment.json files, normalizes allowAccess
 * shapes, runs each unique shape through migrateAllowAccess(), and generates an
 * HTML report comparing old vs new.
 */

import * as fs from 'fs/promises';
import * as path from 'path';

import { migrateAllowAccess } from '../apps/prairielearn/dist/lib/assessment-access-control/migration.js';
import type { AssessmentAccessRuleJson } from '../apps/prairielearn/dist/schemas/infoAssessment.js';

const REPOS_DIR = path.resolve(process.env.HOME!, 'git/python-upgrade-exploration/repos');
const OUTPUT_FILE = path.resolve(
  new URL('.', import.meta.url).pathname,
  'migration-report.html',
);

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

interface NormalizedRule {
  [key: string]: unknown;
}

/** Fields to strip entirely from normalization. */
const STRIP_FIELDS = new Set(['mode', 'comment', 'role']);

function normalizeRules(rules: AssessmentAccessRuleJson[]): {
  shape: string;
  normalized: NormalizedRule[];
} {
  // Strip rules containing uids
  const filtered = rules.filter((r) => !r.uids);
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
    if (rule.examUuid != null && !examUuids.includes(rule.examUuid))
      examUuids.push(rule.examUuid);
    if (rule.timeLimitMin != null && !timeLimits.includes(rule.timeLimitMin))
      timeLimits.push(rule.timeLimitMin);
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
    if (rule.showClosedAssessmentScore != null)
      out.showClosedAssessmentScore = rule.showClosedAssessmentScore;

    // mode, comment, role are stripped (not included)
    return out;
  });

  const shape = JSON.stringify(normalized);
  return { shape, normalized };
}

// ---------------------------------------------------------------------------
// 5-6. Group by shape, pick representative
// ---------------------------------------------------------------------------

interface ShapeGroup {
  shape: string;
  normalized: NormalizedRule[];
  representative: AssessmentAccessRuleJson[];
  count: number;
  filePaths: string[];
}

// ---------------------------------------------------------------------------
// 7. Run migration on each representative
// ---------------------------------------------------------------------------

interface ShapeResult extends ShapeGroup {
  migrationResult: ReturnType<typeof migrateAllowAccess>;
}

// ---------------------------------------------------------------------------
// 8. Generate HTML report
// ---------------------------------------------------------------------------

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function generateHtml(results: ShapeResult[], totalFiles: number, totalWithAccess: number): string {
  // Sort by count descending
  results.sort((a, b) => b.count - a.count);

  const rows = results
    .map((r, i) => {
      const archetype = `${r.migrationResult.archetype.base}${
        r.migrationResult.archetype.modifiers.length
          ? ' + ' + r.migrationResult.archetype.modifiers.join(', ')
          : ''
      }`;
      const errors = r.migrationResult.errors.length
        ? `<div class="errors">${r.migrationResult.errors.map((e) => escapeHtml(e)).join('<br>')}</div>`
        : '';
      const notes = r.migrationResult.notes.length
        ? `<div class="notes">${r.migrationResult.notes.map((n) => escapeHtml(n)).join('<br>')}</div>`
        : '';

      return `
      <tr id="shape-${i}">
        <td class="meta">
          <div class="count">${r.count} assessment${r.count === 1 ? '' : 's'}</div>
          <div class="archetype">${escapeHtml(archetype)}</div>
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
        <td class="new"><pre>${escapeHtml(JSON.stringify(r.migrationResult.result, null, 2))}</pre></td>
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
  .archetype { color: #0066cc; margin: 4px 0; font-weight: 600; }
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
  <span class="stat"><strong>${results.length}</strong> unique shapes</span>
  <span class="stat"><strong>${errorCount}</strong> shapes with errors (${assessmentsWithErrors.toLocaleString()} assessments)</span>
</div>
<div class="filter-bar">
  <label>Filter by archetype:
    <select id="archFilter" onchange="filterRows()">
      <option value="">All</option>
      ${[...new Set(results.map((r) => r.migrationResult.archetype.base))]
        .sort()
        .map((a) => `<option value="${a}">${a}</option>`)
        .join('')}
    </select>
  </label>
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
  const arch = document.getElementById('archFilter').value;
  const errOnly = document.getElementById('errorsOnly').checked;
  document.querySelectorAll('tbody tr').forEach(tr => {
    const archEl = tr.querySelector('.archetype');
    const errEl = tr.querySelector('.errors');
    let show = true;
    if (arch && !archEl.textContent.startsWith(arch)) show = false;
    if (errOnly && !errEl) show = false;
    tr.style.display = show ? '' : 'none';
  });
}
</script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('Scanning for infoAssessment.json files...');
  const files = await findInfoAssessmentFiles(REPOS_DIR);
  console.log(`Found ${files.length} files`);

  const shapeMap = new Map<string, ShapeGroup>();
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

    const { shape, normalized } = normalizeRules(allowAccess);

    const existing = shapeMap.get(shape);
    if (existing) {
      existing.count++;
      if (existing.filePaths.length < 3) {
        existing.filePaths.push(filePath);
      }
    } else {
      // Strip uid rules from representative for migration
      const representative = allowAccess.filter((r) => !r.uids);
      shapeMap.set(shape, {
        shape,
        normalized,
        representative,
        count: 1,
        filePaths: [filePath],
      });
    }
  }

  console.log(`\n${withAccess} assessments with allowAccess`);
  console.log(`${shapeMap.size} unique shapes\n`);

  // Run migration on each representative
  console.log('Running migration on each unique shape...');
  const results: ShapeResult[] = [];

  for (const group of shapeMap.values()) {
    let migrationResult;
    try {
      migrationResult = migrateAllowAccess(group.representative);
    } catch (err: any) {
      migrationResult = {
        archetype: { base: 'unclassified' as const, modifiers: [] as const },
        result: [] as any,
        errors: [`Exception: ${err.message}`],
        notes: [],
        hasUidRules: false,
      };
    }

    results.push({
      ...group,
      migrationResult,
    });
  }

  // Aggregate stats
  const archetypeCounts = new Map<string, number>();
  for (const r of results) {
    const key = r.migrationResult.archetype.base;
    archetypeCounts.set(key, (archetypeCounts.get(key) ?? 0) + r.count);
  }
  console.log('Archetype distribution:');
  for (const [arch, count] of [...archetypeCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${arch}: ${count}`);
  }

  const errorCount = results.filter((r) => r.migrationResult.errors.length > 0).length;
  console.log(`\n${errorCount} shapes with migration errors`);

  // Generate HTML report
  console.log('\nGenerating HTML report...');
  const html = generateHtml(results, files.length, withAccess);
  await fs.writeFile(OUTPUT_FILE, html, 'utf-8');
  console.log(`Report written to ${OUTPUT_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
