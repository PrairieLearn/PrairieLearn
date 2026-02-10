import fs from 'node:fs';

import * as core from '@actions/core';
import * as github from '@actions/github';

const CI_REPORT_MARKER = '<!-- ci-report -->';
const SECTION_START = '<!-- bundle-sizes -->';
const SECTION_END = '<!-- /bundle-sizes -->';
const BASELINE_BRANCH = 'bundle-size';
const BASELINE_PATH = 'sizes.json';

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
      if (diff !== 0) {
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
  const THRESHOLD = 0.5; // percent
  const changedEntries = entries.filter(
    (e) => e.kind === 'changed' && e.oldGzip != null && e.oldGzip > 0,
  );
  const pctChanges = changedEntries.map((e) => ((e.newGzip! - e.oldGzip!) / e.oldGzip!) * 100);
  const totalPct = oldTotal > 0 ? ((newTotal - oldTotal) / oldTotal) * 100 : 0;
  const biggestIncrease = Math.max(...pctChanges, 0);
  const biggestDecrease = Math.min(...pctChanges, 0);
  const hasSignificantChange =
    Math.abs(totalPct) > THRESHOLD || biggestIncrease > THRESHOLD || biggestDecrease < -THRESHOLD;

  let summaryLine: string;
  if (!oldSizes) {
    summaryLine = 'No baseline yet (first run)';
  } else if (!hasSignificantChange) {
    summaryLine = 'No significant size changes';
  } else {
    const parts: string[] = [`Total change: ${totalPct > 0 ? '+' : ''}${totalPct.toFixed(2)}%`];
    if (biggestIncrease > THRESHOLD) {
      parts.push(`Biggest increase: +${biggestIncrease.toFixed(2)}%`);
    }
    if (biggestDecrease < -THRESHOLD) {
      parts.push(`Biggest decrease: ${biggestDecrease.toFixed(2)}%`);
    }
    summaryLine = parts.join(', ');
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

function upsertSection(existingBody: string | null, newSection: string): string {
  if (!existingBody) {
    return `${CI_REPORT_MARKER}\n${newSection}`;
  }

  const startIdx = existingBody.indexOf(SECTION_START);
  const endIdx = existingBody.indexOf(SECTION_END);

  if (startIdx !== -1 && endIdx !== -1) {
    // Replace existing section.
    return (
      existingBody.slice(0, startIdx) + newSection + existingBody.slice(endIdx + SECTION_END.length)
    );
  }

  // Append section.
  return existingBody + '\n' + newSection;
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
      core.info('No baseline found on bundle-size branch');
      return null;
    }
    throw err;
  }
  return null;
}

async function pushBaseline(
  octokit: ReturnType<typeof github.getOctokit>,
  sizes: SizesJson,
): Promise<void> {
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
      // File doesn't exist yet, will be created. Note: the branch must
      // already exist; the Contents API cannot create branches.
    } else {
      throw err;
    }
  }

  await octokit.rest.repos.createOrUpdateFileContents({
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
    path: BASELINE_PATH,
    message: 'Update bundle size baseline',
    content,
    sha: existingSha,
    branch: BASELINE_BRANCH,
  });

  core.info('Pushed bundle size baseline to bundle-size branch');
}

async function commentOnPr(
  octokit: ReturnType<typeof github.getOctokit>,
  prNumber: number,
  section: string,
): Promise<void> {
  const comments = await octokit.paginate(
    'GET /repos/{owner}/{repo}/issues/{issue_number}/comments',
    {
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      issue_number: prNumber,
    },
  );

  const existingComment = comments.find(
    (comment) =>
      comment.user?.login === 'github-actions[bot]' && comment.body?.includes(CI_REPORT_MARKER),
  );

  const body = upsertSection(existingComment?.body ?? null, section);

  if (existingComment) {
    await octokit.rest.issues.updateComment({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      comment_id: existingComment.id,
      body,
    });
  } else {
    await octokit.rest.issues.createComment({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      issue_number: prNumber,
      body,
    });
  }
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

    // Fetch baseline from bundle-size branch.
    const oldSizes = await fetchBaseline(octokit);

    // Build the comment section and post it.
    const section = buildCommentSection(oldSizes, newSizes);
    await commentOnPr(octokit, prNumber, section);
    core.info('Posted bundle size comment on PR');
  } else {
    core.info(`No action needed for event: ${eventName}`);
  }
}

main().catch((err) => {
  console.error(err);
  core.setFailed(err);
});
