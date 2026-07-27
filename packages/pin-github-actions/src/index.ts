/* eslint-disable no-console */
import fs from 'node:fs/promises';
import path from 'node:path';

// Regex to find GitHub Actions usages: 'uses: owner/repo@tag'.
// This intentionally does not include subpaths (owner/repo/path@tag).
const ACTION_REGEX = /uses:\s*([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)@([a-zA-Z0-9_.-]+)/g;

const hashCache = new Map<string, string | null>();
const tagCache = new Map<string, string>();

function isSha(tag: string): boolean {
  return /^[0-9a-fA-F]{40}$/.test(tag);
}

function escapeRegex(value: string): string {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function makeRequest(url: string): Promise<unknown | null> {
  const headers: Record<string, string> = {
    'User-Agent': 'Node-GH-Action-Hasher',
    Accept: 'application/vnd.github+json',
  };

  const githubToken = process.env.GITHUB_TOKEN;
  if (githubToken) {
    headers.Authorization = `token ${githubToken}`;
  }

  try {
    const response = await fetch(url, { headers });
    if (!response.ok) {
      console.error(`API Error on ${url}: ${response.status} ${response.statusText}`);
      return null;
    }
    return (await response.json()) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`API Error on ${url}: ${message}`);
    return null;
  }
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
  if (!data) {
    return null;
  }

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
    return null;
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

function actionMatches(content: string): { actionName: string; tag: string }[] {
  return [...content.matchAll(ACTION_REGEX)].map((match) => ({
    actionName: match[1],
    tag: match[2],
  }));
}

async function resolveSha(
  actionName: string,
  tag: string,
  checkOnly: boolean,
): Promise<string | null> {
  if (isSha(tag)) {
    return tag;
  }

  if (checkOnly) {
    throw new Error(
      `Action ${actionName}@${tag} is not pinned to a commit SHA.\nRun \`make format-actions-version\` to update the file.`,
    );
  }

  const cacheKey = `${actionName}@${tag}`;
  if (hashCache.has(cacheKey)) {
    return hashCache.get(cacheKey) ?? null;
  }

  console.log(`Fetching hash for ${cacheKey}...`);
  const sha = await getActionHash(actionName, tag);
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
  let content = oldContent;

  for (const { actionName, tag } of actionMatches(content)) {
    const sha = await resolveSha(actionName, tag, options.checkOnly);
    if (!sha) continue;

    const resolvedTag = await resolveTag(actionName, sha);
    const oldPattern = new RegExp(
      `uses:\\s*${escapeRegex(actionName)}@${escapeRegex(tag)}[ \\t]*(#.*)?`,
      'g',
    );
    const newPattern = `uses: ${actionName}@${sha} # ${resolvedTag}`;

    content = content.replaceAll(oldPattern, (matched) => {
      if (options.checkOnly && matched !== newPattern) {
        throw new Error(
          `Check failed: ${filePath} uses invalid tag format.\n` +
            `Expected: ${newPattern}\n` +
            `Found:    ${matched}\n` +
            'Run `make format-actions-version` to update the file.',
        );
      }
      return newPattern;
    });
  }

  if (content !== oldContent) {
    await fs.writeFile(filePath, content, 'utf8');
    console.log(`Updated: ${filePath}`);
  }
}

export async function pinGithubActions(options: { checkOnly: boolean }): Promise<void> {
  const workflowDirs = ['.github/workflows', '.github/actions'];

  for (const workflowDir of workflowDirs) {
    try {
      const stats = await fs.stat(workflowDir);
      if (!stats.isDirectory()) throw new Error();
    } catch {
      throw new Error(
        `Directory ${workflowDir} not found. Please run this from your repository root.`,
      );
    }
  }

  for (const workflowDir of workflowDirs) {
    for await (const filePath of fs.glob('**/*.{yml,yaml}', { cwd: workflowDir })) {
      console.log(`Processing ${workflowDir}/${filePath}...`);
      await processWorkflowFile(path.resolve(workflowDir, filePath), options);
    }
  }
}
