import { Buffer } from 'node:buffer';

import {
  DirectoryBackup,
  type DirectoryBackupRecord,
  Files,
  SandboxFileError,
} from '@cloudflare/sandbox';
import { DurableObject, WorkerEntrypoint } from 'cloudflare:workers';
import { z } from 'zod';

import {
  MAX_REVIEW_BYTES,
  MAX_REVIEW_FILE_BYTES,
  type ReviewSnapshot,
  ReviewSnapshotSchema,
} from '@prairielearn/course-agent-types';

import { logEvent } from '../monitoring.js';

import { modelRequestRefusal, prepareSearchRequest } from './model-requests.js';

const SESSION = '/workspace/session';
// Downloaded course data and the agent's analysis scripts.
const COURSE_DATA = `${SESSION}/course-data`;
// Installed by the image from container/codex-config.toml.
const CODEX_CONFIG = '/etc/course-agent/codex-config.toml';
// The image's unprivileged user. Checkpoints record file ownership by ID, so the ID must not change.
const AGENT_USER = 'agent';
const AGENT_UID_GID = '1000:1000';
const NATIVE_PORT = 4500;
// Local reviews diff against this ref, which tracks the contents PrairieLearn has saved.
const LOCAL_SAVED_REF = 'refs/prairielearn/saved';
// SIGKILL takes effect asynchronously, and a killed process stays listed as a zombie until its
// parent reaps it. The runner's parent is the container runtime, which may not reap it while no
// Durable Object awaits its exit. Zombies cannot run, so wait only for live processes to exit.
// Killing again on each pass also catches processes forked while the previous kill ran.
const STOP_AGENT_PROCESSES = `
deadline=$(($(date +%s) + 10))
while :; do
  pkill -KILL -u 1000
  [ "$?" -le 1 ] || exit 2
  live=$(ps -u 1000 -o pid=,stat=,comm= | awk '$2 !~ /^Z/')
  [ -z "$live" ] && exit 0
  if [ "$(date +%s)" -ge "$deadline" ]; then
    echo "Agent processes still running: $live" >&2
    exit 1
  fi
  sleep 0.1
done`;

/** Changes the agent can fix itself, as opposed to sandbox faults that need reporting. */
class UnsupportedReviewError extends Error {}

/** A container command that exited unsuccessfully, keeping its exit code for callers to inspect. */
class SandboxCommandError extends Error {
  constructor(
    message: string,
    readonly exitCode: number,
  ) {
    super(message);
  }
}

/**
 * The agent may fetch the branch without merging it. Diffing against the fetched tip would
 * propose reverting the newer upstream files, so diff against what the checkout is based on.
 */
async function githubReviewBase(git: (...args: string[]) => Promise<string>, branch: string) {
  try {
    return (await git('merge-base', 'HEAD', `refs/remotes/origin/${branch}`)).trim();
  } catch (error) {
    // Exit status 1 means no common ancestor is visible: the shallow clone's fetch depth hid it,
    // or the branch's history was rewritten. Other failures are faults, not the agent's to fix.
    if (!(error instanceof SandboxCommandError) || error.exitCode !== 1) throw error;
    throw new UnsupportedReviewError(
      `Your checkout shares no visible history with origin/${branch}. Run git fetch --unshallow origin ${branch}; if that does not help, the branch was rewritten, so rebase your commits onto origin/${branch}. Then submit again.`,
    );
  }
}

export type CourseSource =
  | { type: 'github'; repository: string; branch: string }
  | { type: 'local'; archiveKey: string; directory: string };
// The named types ctx.container.start() accepts; it rejects `basic`.
// https://developers.cloudflare.com/containers/configuration/scheduling-policy/#choose-an-instance-size-at-runtime
const InstanceTypeSchema = z.enum(['lite', 'standard-1', 'standard-2', 'standard-3', 'standard-4']);

// Cloudflare's maximum time a container can stay disconnected from its Durable Object.
// AGENT_TURN_SECONDS + USER_IDLE_SECONDS must fit within it.
const MAX_CONTAINER_INACTIVITY_SECONDS = 6 * 60 * 60;

/** Read-only access to the bound repository; the container never receives the GitHub token. */
export class CourseAgentGitHubOutbound extends WorkerEntrypoint<
  Env & { GITHUB_READ_TOKEN?: string },
  { repository: string }
> {
  override async fetch(request: Request) {
    const url = new URL(request.url);
    if (url.hostname !== 'repository.internal') return new Response('Forbidden', { status: 403 });
    if (!this.env.GITHUB_READ_TOKEN) {
      return new Response('Repository access is not configured', { status: 503 });
    }
    // GET info/refs supports clone, fetch, pull, and ls-remote.
    // POST git-upload-pack supports downloading objects for clone, fetch, and pull.
    // Only this repository is allowed; push (git-receive-pack) and GitHub APIs are denied.
    const path = `/${this.ctx.props.repository}.git`;
    const discovery =
      request.method === 'GET' &&
      url.pathname === `${path}/info/refs` &&
      url.search === '?service=git-upload-pack';
    const read =
      request.method === 'POST' && url.pathname === `${path}/git-upload-pack` && !url.search;
    if (!discovery && !read) return new Response('Forbidden', { status: 403 });
    const target = new URL(url.pathname + url.search, 'https://github.com');
    const headers = new Headers();
    headers.set('Authorization', `Basic ${btoa(`x-access-token:${this.env.GITHUB_READ_TOKEN}`)}`);
    headers.set('Content-Type', 'application/x-git-upload-pack-request');
    headers.set('Git-Protocol', 'version=2');
    return fetch(target, {
      method: request.method,
      headers,
      body: request.body,
      redirect: 'manual',
    });
  }
}

const OPENAI_API = 'https://api.openai.com';

/**
 * Only the conversation's pinned model and web browsing are available; the API key stays outside
 * the container. OpenAI runs searches and reads pages, so the container never connects to other
 * sites.
 */
export class CourseAgentModelOutbound extends WorkerEntrypoint<
  Env,
  { model: string; sandboxId: string }
> {
  override async fetch(request: Request) {
    const url = new URL(request.url);
    if (url.hostname !== 'model.internal' || url.search || request.method !== 'POST') {
      return new Response('Forbidden', { status: 403 });
    }
    if (url.pathname === '/v1/responses') return this.responses(request);
    if (url.pathname === '/v1/alpha/search') return this.search(request);
    return new Response('Forbidden', { status: 403 });
  }

  private openai(path: string, body: unknown) {
    return fetch(`${OPENAI_API}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      redirect: 'manual',
    });
  }

  private async responses(request: Request) {
    const body = (await request.json()) as {
      model?: string;
      input?: { role?: string }[];
      tools?: unknown;
    };
    if (body.model !== this.ctx.props.model) return new Response('Forbidden', { status: 403 });
    const refusal = modelRequestRefusal(body);
    if (refusal) return new Response(refusal, { status: 403 });
    // Later requests in a turn end with tool output; only the role is read, never the content.
    const firstOfTurn = body.input?.at(-1)?.role === 'user';
    const started = Date.now();
    if (firstOfTurn) logEvent('model_request_sent', { sandboxId: this.ctx.props.sandboxId });
    const response = await this.openai('/v1/responses', body);
    if (firstOfTurn) {
      logEvent('model_response_started', {
        sandboxId: this.ctx.props.sandboxId,
        status: response.status,
        elapsedMs: Date.now() - started,
      });
    }
    return response;
  }

  private async search(request: Request) {
    const body = (await request.json()) as Record<string, unknown>;
    if (body.model !== this.ctx.props.model) return new Response('Forbidden', { status: 403 });
    const prepared = prepareSearchRequest(body);
    if ('refusal' in prepared) {
      logEvent('web_search_refused', { sandboxId: this.ctx.props.sandboxId });
      return Response.json({ output: prepared.refusal });
    }
    const started = Date.now();
    const response = await this.openai('/v1/alpha/search', prepared.forward);
    // OpenAI bills hosted search per call; the response carries no usage to meter.
    logEvent('web_search', {
      sandboxId: this.ctx.props.sandboxId,
      operations: prepared.operations,
      status: response.status,
      elapsedMs: Date.now() - started,
    });
    return response;
  }
}

/** Container, process and archive operations only; lifecycle policy lives in Conversation. */
export class CourseSandbox extends DurableObject<Env> {
  private process: ExecProcess | null = null;
  private nativeToken: string | null = null;
  // Set by prepare(): a container this instance just started has no orphaned processes, and the
  // first runner start must not kill a course clone that is running alongside it.
  private freshContainer = false;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    void ctx.blockConcurrencyWhile(async () => {
      if (ctx.container?.running) {
        await ctx.container.setInactivityTimeout(MAX_CONTAINER_INACTIVITY_SECONDS * 1000);
      }
    });
  }

  private get container() {
    if (!this.ctx.container) throw new Error('Course sandbox container binding is missing');
    return this.ctx.container;
  }

  private get backups() {
    return new DirectoryBackup(this.container, this.ctx.exports.DirectoryBackupGateway, {
      binding: 'CHECKPOINTS',
    });
  }

  private async exec(args: string[], user = 'root') {
    const result = await (await this.container.exec(args, { user })).output();
    if (result.exitCode !== 0) {
      throw new SandboxCommandError(
        `Sandbox command failed: ${new TextDecoder().decode(result.stderr)}`,
        result.exitCode,
      );
    }
    return result;
  }

  /**
   * Start an isolated workspace and configure Codex. A checkpoint is restored here; otherwise the
   * caller adds course files with `addCourseFiles()`, which can run while the Codex runner starts.
   */
  async prepare(
    config: CourseSource & { model: string },
    checkpoint: DirectoryBackupRecord | null,
  ) {
    if (this.container.running) throw new Error('Refusing to reinitialize a running sandbox');
    const instance = InstanceTypeSchema.parse(this.env.SANDBOX_INSTANCE_TYPE);
    // The default `lite` (256 MiB) is too small for Codex and course tooling, and running out of
    // memory restarts the instance, losing unsaved edits.
    this.container.start({
      image: this.container.images.courseAgent,
      enableInternet: false,
      instance,
    });
    await this.container.setInactivityTimeout(MAX_CONTAINER_INACTIVITY_SECONDS * 1000);
    if (config.type !== 'local') {
      await this.container.interceptOutboundHttp(
        'repository.internal:80',
        this.ctx.exports.CourseAgentGitHubOutbound({ props: { repository: config.repository } }),
      );
    }
    await this.container.interceptOutboundHttp(
      'model.internal:80',
      this.ctx.exports.CourseAgentModelOutbound({
        props: { model: config.model, sandboxId: this.ctx.id.name },
      }),
    );
    if (checkpoint) {
      await this.backups.restore(checkpoint);
      // The agent owns its home and may have deleted .codex.
      await this.exec(['mkdir', '-p', `${SESSION}/home/.codex`], AGENT_USER);
      // The image's Codex config may be newer than the checkpoint's, so it is reinstalled.
      await this.exec([
        'install',
        '-o',
        '1000',
        '-g',
        '1000',
        '-m',
        '0644',
        CODEX_CONFIG,
        `${SESSION}/home/.codex/config.toml`,
      ]);
      // The agent may also have deleted its course data directory.
      await this.exec(['mkdir', '-p', COURSE_DATA], AGENT_USER);
      // addCourseFiles() locks a fresh workspace once its files are in place.
      await this.lockSession();
    } else {
      // Run as the agent so the workspace directories that -D creates belong to it.
      await this.exec(
        ['install', '-D', '-m', '0644', CODEX_CONFIG, `${SESSION}/home/.codex/config.toml`],
        AGENT_USER,
      );
      await this.exec(['mkdir', '-p', COURSE_DATA], AGENT_USER);
    }
    this.freshContainer = true;
    // Returned rather than only logged: this Durable Object's logs can arrive late or not at all
    // while its container keeps it busy, so the conversation logs startup instead.
    return { instance };
  }

  /** Keep the parent root-owned so the agent cannot rename or replace course/home directories. */
  private async lockSession() {
    await this.exec(['chown', 'root:root', SESSION]);
  }

  /** Unpack the local snapshot or clone the repository into a freshly prepared workspace. */
  async addCourseFiles(config: CourseSource) {
    if (config.type === 'local') {
      const archive = await this.env.CHECKPOINTS.get(config.archiveKey);
      if (!archive) throw new Error('The local course snapshot is missing');
      const files = new Files(this.container);
      await files.writeFile('/tmp/course-source.tar.gz', archive.body);
      await this.exec(['mkdir', '-p', `${SESSION}/repository`], AGENT_USER);
      await this.exec(
        ['tar', '-xzf', '/tmp/course-source.tar.gz', '-C', `${SESSION}/repository`],
        AGENT_USER,
      );
      await this.exec(['rm', '/tmp/course-source.tar.gz']);
      await this.exec(
        ['git', 'init', '--initial-branch=local', `${SESSION}/repository`],
        AGENT_USER,
      );
      // Local Git must track exact bytes for both the baseline and later reviews.
      await files.writeFile(
        `${SESSION}/repository/.git/info/attributes`,
        '* -text -filter -ident -working-tree-encoding\n',
      );
      await this.exec(['git', '-C', `${SESSION}/repository`, 'add', '--all'], AGENT_USER);
      await this.exec(
        [
          'git',
          '-C',
          `${SESSION}/repository`,
          '-c',
          'commit.gpgsign=false',
          'commit',
          '--allow-empty',
          '-m',
          'Initial local course snapshot',
        ],
        AGENT_USER,
      );
      await this.exec(
        ['git', '-C', `${SESSION}/repository`, 'update-ref', LOCAL_SAVED_REF, 'HEAD'],
        AGENT_USER,
      );
      // Preserve the original Git paths while keeping the native runner's course path stable.
      await this.exec(
        ['ln', '-s', `repository/${config.directory}`, `${SESSION}/course`],
        AGENT_USER,
      );
    } else {
      // Reviews only need the branch tip, and later fetches still work from a shallow clone.
      // Full history made large course repositories take most of startup to clone.
      await this.exec(
        [
          'git',
          'clone',
          '--depth',
          '1',
          '--single-branch',
          '--branch',
          config.branch,
          '--',
          `http://repository.internal/${config.repository}.git`,
          `${SESSION}/course`,
        ],
        AGENT_USER,
      );
    }
    await this.lockSession();
  }

  /**
   * Capture changed-file contents; Conversation persists the returned snapshot. Changes outside
   * the review limits are returned rather than thrown, because error classes don't survive RPC
   * and only those should go back to the agent unreported.
   */
  async captureReview(source: CourseSource): Promise<ReviewSnapshot | { unsupported: string }> {
    try {
      return await this.snapshotChanges(source);
    } catch (error) {
      if (error instanceof UnsupportedReviewError) return { unsupported: error.message };
      throw error;
    }
  }

  private async snapshotChanges(source: CourseSource) {
    const course = `${SESSION}/course`;
    const files = new Files(this.container);
    const options = { cwd: course, user: AGENT_UID_GID };
    const git = async (...args: string[]) => {
      const result = await this.exec(
        ['git', '--literal-pathspecs', '-c', 'safe.directory=*', '-C', course, ...args],
        AGENT_USER,
      );
      try {
        // ignoreBOM keeps a leading U+FEFF, which is part of a file name, not a byte-order mark.
        return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(result.stdout);
      } catch {
        throw new UnsupportedReviewError('Changed file names must be valid UTF-8.');
      }
    };
    if (source.type === 'github') await git('check-ref-format', `refs/heads/${source.branch}`);
    const baseCommit =
      source.type === 'local'
        ? (await git('rev-parse', '--verify', `${LOCAL_SAVED_REF}^{commit}`)).trim()
        : await githubReviewBase(git, source.branch);
    // Include local commits, working files, and untracked files.
    const tracked = await git(
      'diff',
      '--relative',
      '--name-only',
      '-z',
      '--no-renames',
      baseCommit,
      '--',
    );
    const untracked = await git('ls-files', '--others', '--exclude-standard', '-z');
    const paths = [...new Set((tracked + untracked).split('\0').filter(Boolean))];
    const additions: ReviewSnapshot['additions'] = [];
    const deletions: ReviewSnapshot['deletions'] = [];
    let total = 0;
    for (const path of paths) {
      const entry = await git('ls-tree', '-l', baseCommit, '--', path);
      let original: string | null = null;
      if (entry) {
        if (!entry.startsWith('100644 blob ')) {
          throw new UnsupportedReviewError(`Unsupported course file: ${path}`);
        }
        if (Number(entry.split('\t')[0].trim().split(/\s+/)[3]) > MAX_REVIEW_FILE_BYTES) {
          throw new UnsupportedReviewError(`Review file is too large: ${path}`);
        }
        const blob = await this.exec(
          ['git', '-C', course, 'cat-file', 'blob', `${baseCommit}:./${path}`],
          AGENT_USER,
        );
        original = Buffer.from(blob.stdout).toString('base64');
      }
      let info;
      try {
        info = await files.lstat(path, options);
      } catch (error) {
        if (!SandboxFileError.is(error) || error.code !== 'ENOENT') throw error;
      }
      let contents: string | null = null;
      if (info) {
        if (info.type !== 'file' || (info.mode & 0o100) !== 0) {
          throw new UnsupportedReviewError(
            `Only non-executable regular files are supported: ${path}`,
          );
        }
        // Checking first avoids reading a huge file; the bytes read are checked again below.
        if (info.size > BigInt(MAX_REVIEW_FILE_BYTES)) {
          throw new UnsupportedReviewError(`Review file is too large: ${path}`);
        }
        // Capture bytes now: later edits must not change what the instructor approves.
        const bytes = Buffer.from(await (await files.readFile(path, options)).arrayBuffer());
        // The agent's tools can still be writing, so the file may have grown since lstat.
        if (bytes.length > MAX_REVIEW_FILE_BYTES) {
          throw new UnsupportedReviewError(`Review file is too large: ${path}`);
        }
        contents = bytes.toString('base64');
      }
      if (contents === original) continue;
      if (contents === null) deletions.push({ path });
      else additions.push({ path, contents });
      // Count originals, including deletions: PL must be able to display the diff.
      total += (original?.length ?? 0) + (contents?.length ?? 0);
      if (total > MAX_REVIEW_BYTES) {
        throw new UnsupportedReviewError('Reviewed changes are too large');
      }
      if (additions.length + deletions.length > 100) {
        throw new UnsupportedReviewError('A review may change at most 100 files');
      }
    }
    // The other limits are checked above; what remains is the agent's choice of file names.
    const snapshot = ReviewSnapshotSchema.safeParse(
      source.type === 'github'
        ? {
            type: 'github',
            repository: source.repository,
            branch: source.branch,
            baseCommit,
            additions,
            deletions,
          }
        : { type: 'local', additions, deletions },
    );
    if (!snapshot.success) {
      throw new UnsupportedReviewError(
        'Changed file paths must use forward slashes and must not contain .git or control characters.',
      );
    }
    return snapshot.data;
  }

  /**
   * Record the approved bytes on the baseline ref without touching the agent's checkout.
   * Stage the captured contents, not the working tree, which may have changed since capture.
   */
  async advanceLocalBaseline(files: { path: string; contents: string | null }[]) {
    const scratch = '/tmp/course-agent-saved';
    const git = async (...args: string[]) => {
      const result = await this.exec(
        ['env', `GIT_INDEX_FILE=${scratch}/index`, 'git', '-C', `${SESSION}/course`, ...args],
        AGENT_USER,
      );
      return new TextDecoder().decode(result.stdout).trim();
    };
    await this.exec(['mkdir', '-p', scratch], AGENT_USER);
    try {
      // update-index paths are relative to the repository root, which contains the course.
      const prefix = await git('rev-parse', '--show-prefix');
      const toplevel = await git('rev-parse', '--show-toplevel');
      const storage = new Files(this.container);
      await git('read-tree', LOCAL_SAVED_REF);
      for (const [index, file] of files.entries()) {
        const fullPath = `${prefix}${file.path}`;
        if (file.contents === null) {
          await git('-C', toplevel, 'update-index', '--force-remove', '--', fullPath);
          continue;
        }
        const blobPath = `${scratch}/${index}`;
        // The agent can create files in the scratch directory, so write as the agent's user.
        await storage.writeFile(blobPath, Buffer.from(file.contents, 'base64'), {
          user: AGENT_UID_GID,
        });
        const sha = await git('hash-object', '-w', '--no-filters', '--', blobPath);
        await git(
          '-C',
          toplevel,
          'update-index',
          '--add',
          '--cacheinfo',
          `100644,${sha},${fullPath}`,
        );
      }
      const tree = await git('write-tree');
      const commit = await git(
        '-c',
        'commit.gpgsign=false',
        'commit-tree',
        tree,
        '-p',
        LOCAL_SAVED_REF,
        '-m',
        'Saved by PrairieLearn',
      );
      await git('update-ref', LOCAL_SAVED_REF, commit);
    } finally {
      await this.exec(['rm', '-rf', scratch]);
    }
  }

  /** Only private DO callers can upgrade to the runner; no Worker route exposes this port. */
  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('WebSocket required', { status: 426 });
    }
    if (!this.container.running) throw new Error('Native runner has no live sandbox');
    // A fresh connection follows sandbox startup or Conversation DO recovery. Replace any
    // orphaned runner before reconnecting; ordinary turns reuse the existing connection.
    if (this.freshContainer) this.freshContainer = false;
    else await this.stopProcesses();
    this.nativeToken = crypto.randomUUID();
    const digest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(this.nativeToken),
    );
    const hash = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join('');
    const started = Date.now();
    this.process = await this.container.exec(
      [
        'codex-app-server',
        '--listen',
        `ws://0.0.0.0:${NATIVE_PORT}`,
        '--ws-auth',
        'capability-token',
        '--ws-token-sha256',
        hash,
      ],
      {
        user: AGENT_USER,
        // Threads set their own cwd to the course. Home exists before course files are added, so
        // the runner can start while the repository is still being cloned.
        cwd: `${SESSION}/home`,
        env: { HOME: `${SESSION}/home`, CODEX_HOME: `${SESSION}/home/.codex` },
        stdout: 'ignore',
        stderr: 'ignore',
      },
    );
    logEvent('runner_started', {
      sandboxId: this.ctx.id.name,
      pid: this.process.pid,
      elapsedMs: Date.now() - started,
    });
    let exitCode: number | null = null;
    void this.process.exitCode.then((code) => {
      exitCode = code;
    });
    const port = this.container.getTcpPort(NATIVE_PORT);
    const forwarded = new Request('http://container/', request);
    forwarded.headers.delete('host');
    forwarded.headers.set('Authorization', `Bearer ${this.nativeToken}`);
    const deadline = started + 30_000;
    let failures = 0;
    // Use the upgrade for readiness: an empty health response can break the next pooled request.
    // https://github.com/cloudflare/workerd/issues/7597
    // Only connection establishment is retried; protocol commands have not been sent yet.
    for (;;) {
      try {
        const response = await port.fetch(forwarded);
        const elapsedMs = Date.now() - started;
        logEvent('runner_ready', { sandboxId: this.ctx.id.name, elapsedMs, failures });
        return response;
      } catch (error) {
        failures++;
        if (exitCode === null && Date.now() < deadline) {
          await scheduler.wait(100);
          continue;
        }
        const facts = JSON.stringify({
          elapsedMs: Date.now() - started,
          failures,
          exitCode,
          containerRunning: this.container.running,
        });
        throw new Error(`Codex runner did not listen: ${facts}`, { cause: error });
      }
    }
  }

  /**
   * A stopped container has lost its files: crashes, host maintenance, and restarts
   * do not preserve it, so only the last checkpoint remains.
   */
  isRunning() {
    return this.container.running;
  }

  /** Stop all agent/tool processes and verify none can keep editing files. */
  async stopProcesses() {
    if (!this.container.running) {
      this.process = null;
      this.nativeToken = null;
      return;
    }
    // A terminal Codex event does not prove detached tools stopped. Kill and verify
    // every process of the dedicated uid for explicit Stop, recovery, or backup.
    await this.exec(['sh', '-c', STOP_AGENT_PROCESSES]);
    if (this.process) {
      await this.process.exitCode;
      this.process = null;
    }
    this.nativeToken = null;
  }

  /** Create a new archive without changing the conversation's committed backup. */
  async checkpoint() {
    await this.stopProcesses();
    return this.backups.backup({
      dir: SESSION,
      exclude: ['home/.cache', '**/node_modules', 'home/.codex/auth.json'],
    });
  }

  /** Saves downloaded course data outside the course checkout; returns the file path. */
  async writeCourseData(dataset: string, contents: string) {
    const path = `${COURSE_DATA}/${dataset}-${crypto.randomUUID().slice(0, 8)}.jsonl`;
    await new Files(this.container).writeFile(path, contents, { user: AGENT_UID_GID });
    return path;
  }

  async deleteCheckpoint(checkpoint: DirectoryBackupRecord) {
    await this.backups.delete(checkpoint);
  }

  async destroy() {
    await this.container.destroy();
    this.process = null;
    this.nativeToken = null;
  }
}
