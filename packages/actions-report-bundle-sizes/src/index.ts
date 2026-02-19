import fs from 'node:fs';

import * as core from '@actions/core';
import * as github from '@actions/github';

const SECTION_START = '<!-- bundle-sizes -->';
const SECTION_END = '<!-- /bundle-sizes -->';
const BASELINE_BRANCH = 'size-report';
const BASELINE_PATH = 'bundle-sizes.json';

interface AssetSizes {
  raw: number;
  gzip: number;
  brotli: number;
}

type SizesJson = Record<string, AssetSizes>;

function formatBytes(bytes: number): string {
  if (Math.abs(bytes) < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (Math.abs(kb) < 1024) return `${kb.toFixed(1)} kB`;
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
}

function formatChange(oldSize: number, newSize: number): string {
  const diff = newSize - oldSize;
  const sign = diff > 0 ? '+' : '';
  if (oldSize === 0) {
    return `${sign}${formatBytes(diff)} (N/A)`;
  }
  const pct = ((diff / oldSize) * 100).toFixed(2);
  return `${sign}${formatBytes(diff)} (${sign}${pct}%)`;
}

interface DiffEntry {
  name: string;
  kind: 'changed' | 'new' | 'removed';
  oldGzip: number | null;
  newGzip: number | null;
  absDiff: number;
}

function diffSizes(oldSizes: SizesJson | null, newSizes: SizesJson): DiffEntry[] {
  const entries: DiffEntry[] = [];
  const allKeys = new Set([...Object.keys(newSizes), ...Object.keys(oldSizes ?? {})]);

  for (const key of allKeys) {
    const oldEntry = oldSizes?.[key];
    const newEntry = newSizes[key];

    if (oldEntry && newEntry) {
      const diff = newEntry.gzip - oldEntry.gzip;
      if (Math.abs(diff) >= 16) {
        entries.push({
          name: key,
          kind: 'changed',
          oldGzip: oldEntry.gzip,
          newGzip: newEntry.gzip,
          absDiff: Math.abs(diff),
        });
      }
    } else if (newEntry && !oldEntry) {
      entries.push({
        name: key,
        kind: 'new',
        oldGzip: null,
        newGzip: newEntry.gzip,
        absDiff: newEntry.gzip,
      });
    } else if (oldEntry && !newEntry) {
      entries.push({
        name: key,
        kind: 'removed',
        oldGzip: oldEntry.gzip,
        newGzip: null,
        absDiff: oldEntry.gzip,
      });
    }
  }

  // Sort by absolute gzip change, largest first.
  entries.sort((a, b) => b.absDiff - a.absDiff);
  return entries;
}

function buildCommentSection(oldSizes: SizesJson | null, newSizes: SizesJson): string {
  const entries = diffSizes(oldSizes, newSizes);

  // Compute totals across all entry points.
  const allOldKeys = Object.keys(oldSizes ?? {});
  const allNewKeys = Object.keys(newSizes);
  const oldTotal = allOldKeys.reduce((sum, k) => sum + (oldSizes?.[k]?.gzip ?? 0), 0);
  const newTotal = allNewKeys.reduce((sum, k) => sum + newSizes[k].gzip, 0);

  // Build summary line.
  const THRESHOLD_BYTES = 25 * 1024; // 25 kB
  const biggestEntry = entries.length > 0 ? entries[0] : null; // already sorted by absDiff desc

  let summaryLine: string;
  if (!oldSizes) {
    summaryLine = 'No baseline yet (first run)';
  } else if (!biggestEntry || biggestEntry.absDiff < THRESHOLD_BYTES) {
    summaryLine = 'No significant size changes';
  } else {
    const netDiff = newTotal - oldTotal;
    const netSign = netDiff > 0 ? '+' : '';
    const largestSign =
      biggestEntry.kind === 'removed'
        ? '-'
        : biggestEntry.kind === 'new'
          ? '+'
          : biggestEntry.newGzip! >= biggestEntry.oldGzip!
            ? '+'
            : '-';
    summaryLine = `Net: ${netSign}${formatBytes(netDiff)} (largest: ${largestSign}${formatBytes(biggestEntry.absDiff)})`;
  }

  const lines: string[] = [
    SECTION_START,
    `<details><summary><b>Bundle sizes</b> — ${summaryLine}</summary>`,
    '',
  ];

  if (entries.length > 0) {
    lines.push(
      '| Entry point | Old (gzip) | New (gzip) | Change |',
      '| --- | ---: | ---: | ---: |',
    );

    for (const entry of entries) {
      const name = `\`${entry.name}\``;
      if (entry.kind === 'new') {
        lines.push(`| ${name} | — | ${formatBytes(entry.newGzip!)} | new |`);
      } else if (entry.kind === 'removed') {
        lines.push(`| ${name} | ${formatBytes(entry.oldGzip!)} | — | removed |`);
      } else {
        lines.push(
          `| ${name} | ${formatBytes(entry.oldGzip!)} | ${formatBytes(entry.newGzip!)} | ${formatChange(entry.oldGzip!, entry.newGzip!)} |`,
        );
      }
    }

    if (oldSizes) {
      lines.push(
        '',
        `**Total:** ${formatBytes(oldTotal)} → ${formatBytes(newTotal)} (${formatChange(oldTotal, newTotal)})`,
      );
    }
  } else if (oldSizes) {
    lines.push('No changes to bundle sizes.');
  } else {
    lines.push('Baseline will be created when this is merged to master.');
  }

  lines.push('', '</details>', SECTION_END);
  return lines.join('\n');
}

async function fetchBaseline(
  octokit: ReturnType<typeof github.getOctokit>,
): Promise<SizesJson | null> {
  try {
    const response = await octokit.rest.repos.getContent({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      path: BASELINE_PATH,
      ref: BASELINE_BRANCH,
    });

    if ('content' in response.data && response.data.type === 'file') {
      return JSON.parse(
        Buffer.from(response.data.content, 'base64').toString('utf-8'),
      ) as SizesJson;
    }
  } catch (err: unknown) {
    if (typeof err === 'object' && err !== null && 'status' in err && err.status === 404) {
      core.info('No baseline found on size-report branch');
      return null;
    }
    throw err;
  }
  return null;
}

async function isLatestMasterCommit(
  octokit: ReturnType<typeof github.getOctokit>,
): Promise<boolean> {
  const { data: branch } = await octokit.rest.repos.getBranch({
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
    branch: 'master',
  });
  return branch.commit.sha === github.context.sha;
}

async function pushBaseline(
  octokit: ReturnType<typeof github.getOctokit>,
  sizes: SizesJson,
): Promise<void> {
  // Skip if a newer commit has already landed on master, since that build
  // will (or already did) write a more up-to-date baseline.
  if (!(await isLatestMasterCommit(octokit))) {
    core.warning('Skipping baseline update: a newer commit exists on master');
    return;
  }

  const content = Buffer.from(JSON.stringify(sizes, null, 2) + '\n').toString('base64');

  // Check if file already exists to get its SHA (required for updates).
  let existingSha: string | undefined;
  try {
    const response = await octokit.rest.repos.getContent({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      path: BASELINE_PATH,
      ref: BASELINE_BRANCH,
    });
    if ('sha' in response.data) {
      existingSha = response.data.sha;
    }
  } catch (err: unknown) {
    if (typeof err === 'object' && err !== null && 'status' in err && err.status === 404) {
      // File doesn't exist yet, will be created. Note: the size-report
      // branch must already exist; the Contents API cannot create branches.
    } else {
      throw err;
    }
  }

  try {
    await octokit.rest.repos.createOrUpdateFileContents({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      path: BASELINE_PATH,
      message: 'Update bundle size baseline',
      content,
      sha: existingSha,
      branch: BASELINE_BRANCH,
    });
  } catch (err: unknown) {
    if (typeof err === 'object' && err !== null && 'status' in err && err.status === 409) {
      core.warning('Skipping baseline update: conflict (a newer build likely wrote first)');
      return;
    }
    if (typeof err === 'object' && err !== null && 'status' in err && err.status === 422) {
      core.warning('Skipping baseline update: SHA mismatch (a newer build likely wrote first)');
      return;
    }
    throw err;
  }

  core.info('Pushed bundle size baseline to size-report branch');
}

async function main() {
  const sizesPath = core.getInput('sizes-path', { required: true });
  const token = core.getInput('token', { required: true });

  const eventName = github.context.eventName;
  core.info(`Event: ${eventName}`);

  // Read current sizes from disk.
  const newSizes = JSON.parse(fs.readFileSync(sizesPath, 'utf-8')) as SizesJson;
  core.info(`Read ${Object.keys(newSizes).length} entry points from ${sizesPath}`);

  const octokit = github.getOctokit(token);

  if (eventName === 'push') {
    // On push to master, update the baseline.
    const ref = github.context.ref;
    if (ref === 'refs/heads/master') {
      await pushBaseline(octokit, newSizes);
    } else {
      core.info(`Skipping baseline update for non-master push (${ref})`);
    }
  } else if (eventName === 'pull_request') {
    const prNumber = github.context.payload.pull_request?.number;
    if (!prNumber) {
      core.warning('No PR number found in event payload');
      return;
    }

    // Fetch baseline from size-report branch.
    const oldSizes = await fetchBaseline(octokit);

    const section = buildCommentSection(oldSizes, newSizes);
    const reportPath = core.getInput('report-path');
    if (reportPath) {
      fs.writeFileSync(reportPath, section);
      core.info(`Wrote report section to ${reportPath}`);
    }
    core.info(section);
  } else {
    core.info(`No action needed for event: ${eventName}`);
  }
}

main().catch((err) => {
  console.error(err);
  core.setFailed(err);
});
