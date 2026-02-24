import fs from 'node:fs';

import * as core from '@actions/core';
import * as github from '@actions/github';

const SECTION_START = '<!-- image-sizes -->';
const SECTION_END = '<!-- /image-sizes -->';
const BASELINE_BRANCH = 'size-report';
const BASELINE_PATH = 'image-sizes.json';

interface PlatformSize {
  size: number;
  digest: string;
}

type ImageSizesJson = Record<string, Record<string, PlatformSize>>;

function formatBytes(bytes: number): string {
  const mb = bytes / 1024 / 1024;
  return `${mb.toFixed(2)} MB`;
}

function formatChange(oldSize: number, newSize: number): string {
  if (oldSize === 0) return 'N/A';
  const pct = ((newSize / oldSize - 1) * 100).toFixed(2).replace('-0.00', '0.00');
  return `${pct}%`;
}

interface DiffEntry {
  image: string;
  platform: string;
  oldSize: number | null;
  newSize: number;
}

function diffSizes(oldSizes: ImageSizesJson | null, newSizes: ImageSizesJson): DiffEntry[] {
  const entries: DiffEntry[] = [];

  for (const [image, platforms] of Object.entries(newSizes)) {
    for (const [platform, { size }] of Object.entries(platforms)) {
      const oldSize = oldSizes?.[image]?.[platform]?.size ?? null;
      entries.push({ image, platform, oldSize, newSize: size });
    }
  }

  // Sort by image name, then platform.
  entries.sort((a, b) => {
    if (a.image !== b.image) return a.image.localeCompare(b.image);
    return a.platform.localeCompare(b.platform);
  });

  return entries;
}

function buildCommentSection(
  title: string,
  sha: string,
  pushed: boolean,
  oldSizes: ImageSizesJson | null,
  newSizes: ImageSizesJson,
): string {
  const entries = diffSizes(oldSizes, newSizes);

  // Calculate summary statistics.
  const THRESHOLD = 0.5;
  const comparableEntries = entries.filter((e) => e.oldSize != null && e.oldSize > 0);
  const changes = comparableEntries.map((e) => (e.newSize / e.oldSize! - 1) * 100);
  const biggestIncrease = Math.max(...changes, 0);
  const biggestDecrease = Math.min(...changes, 0);
  const hasSignificantIncrease = biggestIncrease > THRESHOLD;
  const hasSignificantDecrease = biggestDecrease < -THRESHOLD;

  let summaryLine: string;
  if (!oldSizes) {
    summaryLine = 'No baseline yet (first run)';
  } else if (hasSignificantIncrease && hasSignificantDecrease) {
    summaryLine = `Biggest increase: +${biggestIncrease.toFixed(2)}%, biggest decrease: ${biggestDecrease.toFixed(2)}%`;
  } else if (hasSignificantIncrease) {
    summaryLine = `Biggest increase: +${biggestIncrease.toFixed(2)}%`;
  } else if (hasSignificantDecrease) {
    summaryLine = `Biggest decrease: ${biggestDecrease.toFixed(2)}%`;
  } else {
    summaryLine = 'No significant size changes';
  }

  const lines: string[] = [
    SECTION_START,
    `<details><summary><b>${title}</b> — ${summaryLine}</summary>`,
    '',
  ];

  if (entries.length > 0) {
    lines.push(
      '| Image | Platform | Old Size | New Size | Change |',
      '| --- | --- | ---: | ---: | ---: |',
    );

    for (const entry of entries) {
      const imageWithTag = `${entry.image}:${sha}`;
      const imageName = pushed
        ? `[\`${imageWithTag}\`](https://hub.docker.com/r/${entry.image}/tags?name=${sha})`
        : `\`${imageWithTag}\``;
      const oldSize = entry.oldSize != null ? formatBytes(entry.oldSize) : 'N/A';
      const newSize = formatBytes(entry.newSize);
      const change =
        entry.oldSize != null && entry.oldSize > 0
          ? formatChange(entry.oldSize, entry.newSize)
          : 'N/A';
      lines.push(`| ${imageName} | ${entry.platform} | ${oldSize} | ${newSize} | ${change} |`);
    }
  } else if (oldSizes) {
    lines.push('No image size changes detected.');
  } else {
    lines.push('Baseline will be created when this is merged to master.');
  }

  lines.push('', '</details>', SECTION_END);
  return lines.join('\n');
}

async function fetchBaseline(
  octokit: ReturnType<typeof github.getOctokit>,
): Promise<ImageSizesJson | null> {
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
      ) as ImageSizesJson;
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

function mergeBaseline(existing: ImageSizesJson | null, newSizes: ImageSizesJson): ImageSizesJson {
  const merged: ImageSizesJson = {};

  // Copy existing entries.
  if (existing) {
    for (const [image, platforms] of Object.entries(existing)) {
      merged[image] = { ...platforms };
    }
  }

  // Merge in new entries, overwriting per-platform.
  for (const [image, platforms] of Object.entries(newSizes)) {
    merged[image] = { ...merged[image], ...platforms };
  }

  return merged;
}

async function pushBaseline(
  octokit: ReturnType<typeof github.getOctokit>,
  sizes: ImageSizesJson,
): Promise<void> {
  if (!(await isLatestMasterCommit(octokit))) {
    core.warning('Skipping baseline update: a newer commit exists on master');
    return;
  }

  const content = Buffer.from(JSON.stringify(sizes, null, 2) + '\n').toString('base64');

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
      message: 'Update image size baseline',
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

  core.info('Pushed image size baseline to size-report branch');
}

async function main() {
  const sizesPath = core.getInput('sizes-path', { required: true });
  const title = core.getInput('title', { required: true });
  const sha = core.getInput('sha', { required: true });
  const pushed = core.getInput('pushed') === 'true';
  const token = core.getInput('token', { required: true });

  const eventName = github.context.eventName;
  core.info(`Event: ${eventName}`);

  const newSizes = JSON.parse(fs.readFileSync(sizesPath, 'utf-8')) as ImageSizesJson;
  core.info(`Read sizes for ${Object.keys(newSizes).length} images from ${sizesPath}`);

  const octokit = github.getOctokit(token);

  if (eventName === 'push') {
    const ref = github.context.ref;
    if (ref === 'refs/heads/master') {
      const existing = await fetchBaseline(octokit);
      const merged = mergeBaseline(existing, newSizes);
      await pushBaseline(octokit, merged);
    } else {
      core.info(`Skipping baseline update for non-master push (${ref})`);
    }
  } else if (eventName === 'pull_request') {
    const prNumber = github.context.payload.pull_request?.number;
    if (!prNumber) {
      core.warning('No PR number found in event payload');
      return;
    }

    const oldSizes = await fetchBaseline(octokit);
    const section = buildCommentSection(title, sha, pushed, oldSizes, newSizes);
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
