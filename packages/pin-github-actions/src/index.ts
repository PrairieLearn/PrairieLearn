/* eslint-disable no-console */
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Matches a complete YAML `uses:` line, capturing the indentation and key prefix, an optional
 * quote, and the quoted or unquoted action reference. An existing inline comment is included in
 * the match so it can be replaced with the resolved tag.
 *
 * For example, it matches both `- uses: actions/checkout@v7` and
 * `uses: 'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1' # v7.0.1`.
 */
const ACTION_LINE_REGEX =
  /^([ \t]*(?:-\s*)?uses:\s*)(?:(['"])([^'"\r\n]+)\2|([^#\s'"]+))[ \t]*(?:#.*)?(?=\r?$)/gm;

/**
 * Splits a remote action reference into the `owner/repository` used for GitHub API requests, an
 * optional action or reusable-workflow subpath, and the tag, branch, or commit SHA after `@`.
 *
 * For example, `github/codeql-action/init@v4` is split into `github/codeql-action`, `/init`, and
 * `v4`, while `actions/checkout@v7` has an empty subpath.
 */
const ACTION_REFERENCE_REGEX = /^([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)((?:\/[^@\s]+)*)@([^\s]+)$/;

const hashCache = new Map<string, string>();
const tagCache = new Map<string, string>();

function isSha(tag: string): boolean {
  return /^[0-9a-fA-F]{40}$/.test(tag);
}

async function makeRequest(url: string): Promise<unknown> {
  const headers: Record<string, string> = {
    'User-Agent': 'Node-GH-Action-Hasher',
    Accept: 'application/vnd.github+json',
  };

  const githubToken = process.env.GITHUB_TOKEN;
  if (githubToken) {
    headers.Authorization = `token ${githubToken}`;
  }

  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(
      `GitHub API request failed for ${url}: ${response.status} ${response.statusText}`,
    );
  }
  return (await response.json()) as unknown;
}

function readObjectSha(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const objectValue = (value as { object?: unknown }).object;
  if (!objectValue || typeof objectValue !== 'object') return null;
  const sha = (objectValue as { sha?: unknown }).sha;
  return typeof sha === 'string' ? sha : null;
}

function readObjectType(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const objectValue = (value as { object?: unknown }).object;
  if (!objectValue || typeof objectValue !== 'object') return null;
  const type = (objectValue as { type?: unknown }).type;
  return typeof type === 'string' ? type : null;
}

function readObjectUrl(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const objectValue = (value as { object?: unknown }).object;
  if (!objectValue || typeof objectValue !== 'object') return null;
  const url = (objectValue as { url?: unknown }).url;
  return typeof url === 'string' ? url : null;
}

export async function getActionHash(actionName: string, tag: string): Promise<string | null> {
  const url = `https://api.github.com/repos/${actionName}/git/refs/tags/${tag}`;
  const data = await makeRequest(url);

  const refData = Array.isArray(data) ? data[data.length - 1] : data;
  const objectType = readObjectType(refData);

  if (objectType === 'tag') {
    const tagUrl = readObjectUrl(refData);
    const tagData = tagUrl ? await makeRequest(tagUrl) : null;
    if (!tagData) return null;
    return readObjectSha(tagData);
  }

  return readObjectSha(refData);
}

export async function getTagFromHash(
  actionName: string,
  commitSha: string,
): Promise<string | null> {
  const url = `https://api.github.com/repos/${actionName}/tags?per_page=100`;
  const tagsData = await makeRequest(url);

  if (!Array.isArray(tagsData)) {
    throw new Error(`GitHub API returned an unexpected response for ${url}`);
  }

  for (const tagObj of tagsData) {
    if (!tagObj || typeof tagObj !== 'object') continue;

    const commit = (tagObj as { commit?: unknown }).commit;
    if (!commit || typeof commit !== 'object') continue;

    const sha = (commit as { sha?: unknown }).sha;
    if (sha !== commitSha) continue;

    const name = (tagObj as { name?: unknown }).name;
    return typeof name === 'string' ? name : null;
  }

  return null;
}

function actionMatches(content: string): {
  actionName: string;
  actionPath: string;
  tag: string;
  prefix: string;
  quote: string;
  matched: string;
  index: number;
}[] {
  return [...content.matchAll(ACTION_LINE_REGEX)].flatMap((match) => {
    const reference = match[3] ?? match[4];
    if (
      !reference ||
      reference.startsWith('./') ||
      reference.startsWith('../') ||
      reference.startsWith('docker://')
    ) {
      return [];
    }

    const referenceMatch = ACTION_REFERENCE_REGEX.exec(reference);
    if (!referenceMatch) return [];

    return [
      {
        actionName: referenceMatch[1],
        actionPath: referenceMatch[2],
        tag: referenceMatch[3],
        prefix: match[1],
        quote: match[2] ?? '',
        matched: match[0],
        index: match.index,
      },
    ];
  });
}

async function resolveSha(actionName: string, tag: string, checkOnly: boolean): Promise<string> {
  if (isSha(tag)) {
    return tag;
  }

  if (checkOnly) {
    throw new Error(
      `Action ${actionName}@${tag} is not pinned to a commit SHA.\nRun \`make format-actions-version\` to update the file.`,
    );
  }

  const cacheKey = `${actionName}@${tag}`;
  const cachedSha = hashCache.get(cacheKey);
  if (cachedSha) return cachedSha;

  console.log(`Fetching hash for ${cacheKey}...`);
  const sha = await getActionHash(actionName, tag);
  if (!sha) {
    throw new Error(`Could not resolve a commit SHA for ${cacheKey}.`);
  }
  hashCache.set(cacheKey, sha);
  return sha;
}

async function resolveTag(actionName: string, sha: string): Promise<string> {
  const cacheKey = `${actionName}@${sha}`;
  if (tagCache.has(cacheKey)) {
    return tagCache.get(cacheKey)!;
  }

  const resolvedTag = (await getTagFromHash(actionName, sha)) ?? 'tag not found';
  tagCache.set(cacheKey, resolvedTag);
  return resolvedTag;
}

export async function processWorkflowFile(
  filePath: string,
  options: { checkOnly: boolean },
): Promise<void> {
  const oldContent = await fs.readFile(filePath, 'utf8');
  const contentParts: string[] = [];
  let previousIndex = 0;

  for (const { actionName, actionPath, tag, prefix, quote, matched, index } of actionMatches(
    oldContent,
  )) {
    const sha = await resolveSha(actionName, tag, options.checkOnly);

    const resolvedTag = await resolveTag(actionName, sha);
    const newPattern = `${prefix}${quote}${actionName}${actionPath}@${sha}${quote} # ${resolvedTag}`;

    if (options.checkOnly && matched !== newPattern) {
      throw new Error(
        `Check failed: ${filePath} uses invalid tag format.\n` +
          `Expected: ${newPattern}\n` +
          `Found:    ${matched}\n` +
          'Run `make format-actions-version` to update the file.',
      );
    }

    contentParts.push(oldContent.slice(previousIndex, index), newPattern);
    previousIndex = index + matched.length;
  }

  contentParts.push(oldContent.slice(previousIndex));
  const content = contentParts.join('');
  if (content !== oldContent) {
    await fs.writeFile(filePath, content, 'utf8');
    console.log(`Updated: ${filePath}`);
  }
}

export async function pinGithubActions(options: { checkOnly: boolean }): Promise<void> {
  const repositoryRoot = process.cwd();
  const workflowsDir = path.resolve(repositoryRoot, '.github/workflows');
  const actionsDir = path.resolve(repositoryRoot, '.github/actions');

  try {
    const stats = await fs.stat(workflowsDir);
    if (!stats.isDirectory()) throw new Error();
  } catch {
    throw new Error(
      `Directory ${workflowsDir} not found. Please run this from your repository root.`,
    );
  }

  const workflowDirs = [workflowsDir];
  try {
    const stats = await fs.stat(actionsDir);
    if (!stats.isDirectory()) throw new Error(`${actionsDir} is not a directory.`);
    workflowDirs.push(actionsDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }

  for (const workflowDir of workflowDirs) {
    for await (const filePath of fs.glob('**/*.{yml,yaml}', { cwd: workflowDir })) {
      console.log(`Processing ${workflowDir}/${filePath}...`);
      await processWorkflowFile(path.resolve(workflowDir, filePath), options);
    }
  }
}
