import type { ISandbox, SandboxCommand } from '@cloudflare/sandbox';

import { type AgentRepository, AgentRepositorySchema } from '@prairielearn/agent-protocol';

const coursePath = '/workspace/course';
const bundleDirectory = '/tmp/prairielearn-agent-bundles';
const maxBundleParts = 512;
const maxBundleBytes = 512 * 1024 * 1024;

interface GitBundlePart {
  kind: 'baseline' | 'incremental';
  key: string;
  sha256: string;
  headSha: string;
  size: number;
}

export interface GitCheckpointManifest {
  version: 1;
  conversationId: string;
  courseId: string;
  repository?: AgentRepository;
  branch: string;
  headSha: string;
  parts: GitBundlePart[];
  updatedAt: string;
}

type SandboxClient = Pick<ISandbox, 'deleteFile' | 'exec' | 'mkdir' | 'readFile' | 'writeFile'>;

export async function prepareCourseWorkspace({
  sandbox,
  bucket,
  conversationId,
  courseId,
  runId,
  repository,
}: {
  sandbox: SandboxClient;
  bucket: R2Bucket;
  conversationId: string;
  courseId: string;
  runId: string;
  repository?: AgentRepository;
}): Promise<GitCheckpointManifest> {
  const existing = await loadGitCheckpoint(bucket, conversationId);
  if (existing) {
    assertCheckpointBinding(existing, courseId, repository);
    await restoreGitCheckpoint(sandbox, bucket, existing, { courseId, repository });
    return existing;
  }

  await removeCourseWorkspace(sandbox);
  const branch = agentBranch(courseId, runId);
  if (repository) {
    await execChecked(sandbox, ['git', 'clone', '--no-checkout', repository.https_url, coursePath]);
    await execChecked(sandbox, [
      'git',
      '-C',
      coursePath,
      'checkout',
      '-B',
      branch,
      repository.base_sha,
    ]);
    await configureGitIdentity(sandbox);
  } else {
    await sandbox.mkdir(coursePath, { recursive: true });
    await execChecked(sandbox, ['git', '-C', coursePath, 'init', '-b', branch]);
    await configureGitIdentity(sandbox);
    await sandbox.writeFile(
      `${coursePath}/README.md`,
      '# Deterministic PrairieLearn agent course\n',
    );
    await execChecked(sandbox, ['git', '-C', coursePath, 'add', 'README.md']);
    await execChecked(sandbox, [
      'git',
      '-C',
      coursePath,
      'commit',
      '-m',
      'Initialize deterministic agent course',
    ]);
  }

  return await createGitCheckpoint({
    sandbox,
    bucket,
    conversationId,
    courseId,
    repository,
    branch,
  });
}

export async function createGitCheckpoint({
  sandbox,
  bucket,
  conversationId,
  courseId,
  repository,
  branch,
}: {
  sandbox: SandboxClient;
  bucket: R2Bucket;
  conversationId: string;
  courseId?: string;
  repository?: AgentRepository;
  branch: string;
}): Promise<GitCheckpointManifest> {
  const headSha = (
    await execChecked(sandbox, ['git', '-C', coursePath, 'rev-parse', 'HEAD'])
  ).trim();
  assertGitSha(headSha);
  const current = await loadGitCheckpoint(bucket, conversationId);
  if (current && courseId) assertCheckpointBinding(current, courseId, repository);
  if (current?.headSha === headSha) return current;
  if ((current?.parts.length ?? 0) >= maxBundleParts) {
    throw new Error('Git bundle part limit reached');
  }

  await sandbox.mkdir(bundleDirectory, { recursive: true });
  const sequence = current?.parts.length ?? 0;
  const kind = current ? 'incremental' : 'baseline';
  const localPath = `${bundleDirectory}/${sequence.toString().padStart(6, '0')}.bundle`;
  const command: SandboxCommand = current
    ? ['git', '-C', coursePath, 'bundle', 'create', localPath, 'HEAD', `^${current.headSha}`]
    : ['git', '-C', coursePath, 'bundle', 'create', localPath, '--all'];
  await execChecked(sandbox, command);
  const sha256 = await sha256File(sandbox, localPath);
  const size = Number((await execChecked(sandbox, ['stat', '-c', '%s', localPath])).trim());
  if (!Number.isSafeInteger(size) || size < 0) throw new Error('Invalid Git bundle size');
  if ((current?.parts.reduce((sum, part) => sum + part.size, 0) ?? 0) + size > maxBundleBytes) {
    throw new Error('Git bundle storage limit reached');
  }
  const key = `conversations/${conversationId}/git/bundles/${sequence.toString().padStart(6, '0')}-${headSha}.bundle`;
  const bundle = await sandbox.readFile(localPath, { encoding: 'none' });
  if (bundle.size !== size) throw new Error('Git bundle size changed before upload');
  const fixedLength = new FixedLengthStream(size);
  await Promise.all([
    bundle.content.pipeTo(fixedLength.writable),
    bucket.put(key, fixedLength.readable, {
      onlyIf: { etagDoesNotMatch: '*' },
      customMetadata: { sha256, headSha, kind, size: String(size) },
    }),
  ]);
  await sandbox.deleteFile(localPath);

  const manifest: GitCheckpointManifest = {
    version: 1,
    conversationId,
    courseId: current?.courseId ?? requireValue(courseId, 'courseId'),
    repository: current?.repository ?? repository,
    branch,
    headSha,
    parts: [...(current?.parts ?? []), { kind, key, sha256, headSha, size }],
    updatedAt: new Date().toISOString(),
  };
  await bucket.put(gitManifestKey(conversationId), JSON.stringify(manifest), {
    httpMetadata: { contentType: 'application/json' },
  });
  return manifest;
}

export async function loadGitCheckpoint(
  bucket: R2Bucket,
  conversationId: string,
): Promise<GitCheckpointManifest | null> {
  const object = await bucket.get(gitManifestKey(conversationId));
  if (!object) return null;
  return parseGitCheckpoint(await object.json(), conversationId);
}

export async function restoreGitCheckpoint(
  sandbox: SandboxClient,
  bucket: R2Bucket,
  manifest: GitCheckpointManifest,
  expected?: { courseId: string; repository?: AgentRepository },
): Promise<void> {
  if (expected) assertCheckpointBinding(manifest, expected.courseId, expected.repository);
  if (manifest.parts.length === 0 || manifest.parts[0].kind !== 'baseline') {
    throw new Error('Git checkpoint is missing its baseline bundle');
  }
  await removeCourseWorkspace(sandbox);
  await sandbox.mkdir(bundleDirectory, { recursive: true });

  for (const [index, part] of manifest.parts.entries()) {
    const object = await bucket.get(part.key);
    if (!object) throw new Error(`Missing Git bundle: ${part.key}`);
    const localPath = `${bundleDirectory}/${index.toString().padStart(6, '0')}.bundle`;
    if (!object.body) throw new Error(`Git bundle has no body: ${part.key}`);
    await sandbox.writeFile(localPath, object.body);
    const actualChecksum = await sha256File(sandbox, localPath);
    if (actualChecksum !== part.sha256) {
      throw new Error(`Git bundle checksum mismatch: ${part.key}`);
    }

    if (part.kind === 'baseline') {
      await execChecked(sandbox, ['git', 'clone', localPath, coursePath]);
    } else {
      await execChecked(sandbox, ['git', '-C', coursePath, 'fetch', localPath, 'HEAD']);
    }
  }

  await execChecked(sandbox, [
    'git',
    '-C',
    coursePath,
    'checkout',
    '-B',
    manifest.branch,
    manifest.headSha,
  ]);
  await configureGitIdentity(sandbox);
  const restoredHead = (
    await execChecked(sandbox, ['git', '-C', coursePath, 'rev-parse', 'HEAD'])
  ).trim();
  if (restoredHead !== manifest.headSha) {
    throw new Error('Restored Git HEAD does not match manifest');
  }
}

export async function currentGitHead(sandbox: SandboxClient): Promise<string> {
  const head = (await execChecked(sandbox, ['git', '-C', coursePath, 'rev-parse', 'HEAD'])).trim();
  assertGitSha(head);
  return head;
}

export async function createCommittedQuestionSnapshot(
  sandbox: SandboxClient,
  rawQid: string,
): Promise<{ qid: string; files: { path: string; content: string }[]; headSha: string }> {
  const qid = safeRelativePath(rawQid, 'qid');
  if ((await execChecked(sandbox, ['git', '-C', coursePath, 'status', '--porcelain'])).trim()) {
    throw new Error('Commit all course edits before calling render_question');
  }
  const headSha = (
    await execChecked(sandbox, ['git', '-C', coursePath, 'rev-parse', 'HEAD'])
  ).trim();
  assertGitSha(headSha);
  const prefix = `questions/${qid}/`;
  const tree = await execChecked(sandbox, [
    'git',
    '-C',
    coursePath,
    'ls-tree',
    '-r',
    'HEAD',
    '--',
    prefix,
  ]);
  const candidates = tree
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const modeSeparator = line.indexOf(' ');
      const pathSeparator = line.indexOf('\t');
      const mode = line.slice(0, modeSeparator);
      const repoPath = line.slice(pathSeparator + 1);
      if (modeSeparator < 1 || pathSeparator < 1 || !repoPath.startsWith(prefix)) {
        throw new Error('Invalid Git tree entry');
      }
      if (mode === '120000') throw new Error('render_question does not allow symlinks');
      return { repoPath, relativePath: repoPath.slice(prefix.length) };
    })
    .filter((file) => isAllowedQuestionFile(file.relativePath));
  if (candidates.length > 30) throw new Error('render_question includes more than 30 files');
  if (!candidates.some((file) => file.relativePath === 'question.html')) {
    throw new Error('render_question requires question.html');
  }
  let totalSize = 0;
  const files = [];
  for (const file of candidates) {
    const content = await execChecked(sandbox, [
      'git',
      '-C',
      coursePath,
      'show',
      `HEAD:${file.repoPath}`,
    ]);
    totalSize += new TextEncoder().encode(content).byteLength;
    if (totalSize > 1_048_576) throw new Error('render_question files exceed 1 MiB');
    files.push({ path: file.relativePath, content });
  }
  return { qid, files, headSha };
}

export async function pushExactGitHead(
  sandbox: SandboxClient,
  repositoryHttpsUrl: string,
  branch: string,
  headSha: string,
): Promise<void> {
  assertGitSha(headSha);
  await execChecked(sandbox, [
    'git',
    '-C',
    coursePath,
    'push',
    repositoryHttpsUrl,
    `${headSha}:refs/heads/${branch}`,
  ]);
}

export function agentBranch(courseId: string, runId: string): string {
  return `pl-agent/${safeRefPart(courseId)}/${safeRefPart(runId)}`;
}

function gitManifestKey(conversationId: string): string {
  return `conversations/${conversationId}/git/latest.json`;
}

function parseGitCheckpoint(value: unknown, conversationId: string): GitCheckpointManifest {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    !('version' in value) ||
    value.version !== 1 ||
    !('conversationId' in value) ||
    value.conversationId !== conversationId ||
    !('courseId' in value) ||
    typeof value.courseId !== 'string' ||
    !('branch' in value) ||
    typeof value.branch !== 'string' ||
    !('headSha' in value) ||
    typeof value.headSha !== 'string' ||
    !('parts' in value) ||
    !Array.isArray(value.parts) ||
    !('updatedAt' in value) ||
    typeof value.updatedAt !== 'string'
  ) {
    throw new Error('Invalid Git checkpoint manifest');
  }
  assertGitSha(value.headSha);
  const parts = value.parts.map((part) => {
    if (
      typeof part !== 'object' ||
      part === null ||
      Array.isArray(part) ||
      !('kind' in part) ||
      (part.kind !== 'baseline' && part.kind !== 'incremental') ||
      !('key' in part) ||
      typeof part.key !== 'string' ||
      !('sha256' in part) ||
      typeof part.sha256 !== 'string' ||
      !/^[0-9a-f]{64}$/.test(part.sha256) ||
      !('headSha' in part) ||
      typeof part.headSha !== 'string' ||
      !('size' in part) ||
      typeof part.size !== 'number' ||
      !Number.isSafeInteger(part.size) ||
      !/^\d+$/.test(String(part.size))
    ) {
      throw new Error('Invalid Git bundle part');
    }
    assertGitSha(part.headSha);
    return part as GitBundlePart;
  });
  const repository =
    'repository' in value ? AgentRepositorySchema.parse(value.repository) : undefined;
  return { ...value, repository, parts } as GitCheckpointManifest;
}

function assertCheckpointBinding(
  manifest: GitCheckpointManifest,
  courseId: string,
  repository: AgentRepository | undefined,
): void {
  if (!checkpointBindingMatches(manifest, courseId, repository)) {
    throw new Error('Git checkpoint does not match the authorized course repository');
  }
}

export function checkpointBindingMatches(
  manifest: GitCheckpointManifest,
  courseId: string,
  repository: AgentRepository | undefined,
): boolean {
  return (
    manifest.courseId === courseId &&
    JSON.stringify(manifest.repository) === JSON.stringify(repository)
  );
}

function requireValue(value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name} is required for the baseline Git checkpoint`);
  return value;
}

async function removeCourseWorkspace(sandbox: SandboxClient): Promise<void> {
  await execChecked(sandbox, ['/bin/rm', '-rf', coursePath, bundleDirectory]);
}

async function configureGitIdentity(sandbox: SandboxClient): Promise<void> {
  await execChecked(sandbox, [
    'git',
    '-C',
    coursePath,
    'config',
    'user.name',
    'PrairieLearn Agent',
  ]);
  await execChecked(sandbox, [
    'git',
    '-C',
    coursePath,
    'config',
    'user.email',
    'agent@prairielearn.invalid',
  ]);
}

async function sha256File(sandbox: SandboxClient, path: string): Promise<string> {
  const output = (await execChecked(sandbox, ['sha256sum', path])).trim().split(/\s+/, 1)[0];
  if (!/^[0-9a-f]{64}$/.test(output)) throw new Error('Unable to checksum Git bundle');
  return output;
}

async function execChecked(sandbox: SandboxClient, command: SandboxCommand): Promise<string> {
  const process = await sandbox.exec(command, { timeout: 120_000 });
  const output = await process.output({ encoding: 'utf8', timeout: 120_000 });
  if (output.exitCode !== 0) {
    throw new Error(`${command[0]} exited with ${output.exitCode}: ${output.stderr}`);
  }
  return output.stdout;
}

function safeRefPart(value: string): string {
  const result = value.replaceAll(/[^A-Za-z0-9._-]/g, '-');
  if (!result || result === '.' || result === '..') throw new Error('Invalid Git ref component');
  return result;
}

function safeRelativePath(path: string, name: string): string {
  if (path.startsWith('/') || path.includes('\\')) throw new Error(`Invalid ${name}`);
  const segments = path.split('/');
  if (
    segments.length === 0 ||
    segments.some(
      (segment) =>
        !segment ||
        segment === '.' ||
        segment === '..' ||
        !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(segment),
    )
  ) {
    throw new Error(`Invalid ${name}`);
  }
  return segments.join('/');
}

function isAllowedQuestionFile(path: string): boolean {
  try {
    safeRelativePath(path, 'question file');
  } catch {
    return false;
  }
  if (
    path === 'question.html' ||
    path === 'question.py' ||
    path === 'server.py' ||
    path === 'info.json'
  ) {
    return true;
  }
  return /^(?:assets\/)?[A-Za-z0-9._/-]+\.(?:css|csv|html|js|json|md|svg|txt)$/.test(path);
}

function assertGitSha(value: string): void {
  if (!/^[0-9a-f]{40}$/.test(value)) throw new Error('Invalid Git SHA');
}
