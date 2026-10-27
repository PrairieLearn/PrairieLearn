import { Buffer } from 'node:buffer';

import {
  DirectoryBackup,
  type DirectoryBackupRecord,
  Files,
  SandboxFileError,
} from '@cloudflare/sandbox';
import { DurableObject, WorkerEntrypoint } from 'cloudflare:workers';

import {
  MAX_REVIEW_BYTES,
  MAX_REVIEW_FILE_BYTES,
  type ReviewSnapshot,
  ReviewSnapshotSchema,
} from '@prairielearn/course-agent-types';

const SESSION = '/workspace/session';
const NATIVE_PORT = 4500;
const lifetimeMs = (env: Env) =>
  (Number(env.AGENT_TURN_SECONDS) + Number(env.USER_IDLE_SECONDS) + 3600) * 1000;

/** Only these two private hostnames can leave a container. Secrets stay here. */
export class CourseAgentOutbound extends WorkerEntrypoint<
  Env,
  { repository: string; model: string }
> {
  // Add credentials only after checking that the request targets the bound
  // repository or model. The container never receives the underlying tokens.
  override async fetch(request: Request) {
    const url = new URL(request.url);
    const headers = new Headers();
    let target: URL;
    if (url.hostname === 'repository.internal') {
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
      target = new URL(url.pathname + url.search, 'https://github.com');
      headers.set('Authorization', `Basic ${btoa(`x-access-token:${this.env.GITHUB_READ_TOKEN}`)}`);
      headers.set('Content-Type', 'application/x-git-upload-pack-request');
      headers.set('Git-Protocol', 'version=2');
    } else if (
      url.hostname === 'model.internal' &&
      url.pathname === '/v1/responses' &&
      !url.search &&
      request.method === 'POST'
    ) {
      const body = (await request.json()) as { model?: string };
      if (body.model !== this.ctx.props.model) return new Response('Forbidden', { status: 403 });
      headers.set('Authorization', `Bearer ${this.env.OPENAI_API_KEY}`);
      headers.set('Content-Type', 'application/json');
      return fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        redirect: 'manual',
      });
    } else {
      return new Response('Forbidden', { status: 403 });
    }
    return fetch(target, {
      method: request.method,
      headers,
      body: request.body,
      redirect: 'manual',
    });
  }
}

/** Container, process and archive operations only; lifecycle policy lives in Conversation. */
export class CourseSandbox extends DurableObject<Env> {
  private process: ExecProcess | null = null;
  private nativeToken: string | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      if (ctx.container?.running) await ctx.container.setInactivityTimeout(lifetimeMs(env));
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
      throw new Error(`Sandbox command failed: ${new TextDecoder().decode(result.stderr)}`);
    }
    return result;
  }

  /** Start an isolated workspace, restore or clone its files, and configure Codex. */
  async prepare(
    config: { repository: string; branch: string; model: string },
    checkpoint: DirectoryBackupRecord | null,
  ) {
    if (this.container.running) throw new Error('Refusing to reinitialize a running sandbox');
    this.container.start({ image: this.container.images.courseAgent, enableInternet: false });
    await this.container.setInactivityTimeout(lifetimeMs(this.env));
    const outbound = this.ctx.exports.CourseAgentOutbound({ props: config });
    await this.container.interceptOutboundHttp('repository.internal:80', outbound);
    await this.container.interceptOutboundHttp('model.internal:80', outbound);
    await this.exec(['mkdir', '-p', '/workspace']);
    if (checkpoint) {
      await this.backups.restore(checkpoint);
    } else {
      await this.exec(['mkdir', '-p', `${SESSION}/home/.codex`]);
      await this.exec(['chown', '-R', '1000:1000', SESSION]);
      await this.exec(
        [
          'git',
          'clone',
          '--single-branch',
          '--branch',
          config.branch,
          '--',
          `http://repository.internal/${config.repository}.git`,
          `${SESSION}/course`,
        ],
        'node',
      );
    }
    // Configuration contains no credentials. It is reapplied after restoration.
    const files = new Files(this.container);
    await files.writeFile(
      `${SESSION}/home/.codex/config.toml`,
      'model_provider = "prairielearn"\n[model_providers.prairielearn]\nname = "PrairieLearn"\nbase_url = "http://model.internal/v1"\nwire_api = "responses"\nsupports_websockets = false\nrequires_openai_auth = false\n',
    );
    await this.exec(['chown', '-R', '1000:1000', `${SESSION}/home`]);
    await this.exec(['chown', 'root:root', SESSION]);
  }

  /** Save the current file contents; the DO owns the snapshot after this returns. */
  async captureReview(repository: string, branch: string) {
    const course = `${SESSION}/course`;
    const files = new Files(this.container);
    const options = { cwd: course, user: '1000:1000' };
    const git = async (...args: string[]) => {
      const result = await this.exec(
        ['git', '--literal-pathspecs', '-c', 'safe.directory=*', '-C', course, ...args],
        'node',
      );
      return new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(result.stdout);
    };
    await git('check-ref-format', `refs/heads/${branch}`);
    const baseCommit = (
      await git('rev-parse', '--verify', `refs/remotes/origin/${branch}^{commit}`)
    ).trim();

    // Comparing with the remote base includes local commits and staged/unstaged edits.
    // Untracked files need a separate listing; NUL delimiters preserve spaces in paths.
    const tracked = await git('diff', '--name-only', '-z', '--no-renames', baseCommit, '--');
    const untracked = await git('ls-files', '--others', '--exclude-standard', '-z');
    const paths = [...new Set((tracked + untracked).split('\0').filter(Boolean))];
    if (paths.length > 100) throw new Error('A review may change at most 100 files');

    const additions: ReviewSnapshot['additions'] = [];
    const deletions: ReviewSnapshot['deletions'] = [];
    let total = 0;
    for (const path of paths) {
      let info;
      try {
        info = await files.lstat(path, options);
      } catch (error) {
        if (!SandboxFileError.is(error) || error.code !== 'ENOENT') throw error;
        deletions.push({ path });
        continue;
      }
      if (info.type !== 'file') throw new Error(`Unsupported course file: ${path}`);
      if (info.size > BigInt(MAX_REVIEW_FILE_BYTES)) {
        throw new Error(`Review file is too large: ${path}`);
      }
      const old = await git('ls-tree', baseCommit, '--', path);
      const mode = info.mode & 0o100 ? '100755' : '100644';
      if (mode !== '100644' || (old && old.slice(0, 6) !== mode)) {
        throw new Error(`File mode changes are not supported: ${path}`);
      }

      // Save bytes now: later edits must not change what the instructor approves.
      const response = await files.readFile(path, options);
      const contents = Buffer.from(await response.arrayBuffer()).toString('base64');
      total += contents.length;
      if (total > MAX_REVIEW_BYTES) throw new Error('Reviewed changes are too large');
      additions.push({ path, contents });
    }
    return ReviewSnapshotSchema.parse({ repository, branch, baseCommit, additions, deletions });
  }

  /** Only private DO callers can upgrade to the runner; no Worker route exposes this port. */
  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('WebSocket required', { status: 426 });
    }
    if (!this.container.running || this.process || this.nativeToken) {
      throw new Error('Native runner is unavailable or already connected');
    }
    this.nativeToken = crypto.randomUUID();
    const digest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(this.nativeToken),
    );
    const hash = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join('');
    this.process = await this.container.exec(
      [
        'codex',
        'app-server',
        '--listen',
        `ws://0.0.0.0:${NATIVE_PORT}`,
        '--ws-auth',
        'capability-token',
        '--ws-token-sha256',
        hash,
      ],
      {
        user: 'node',
        cwd: `${SESSION}/course`,
        env: { HOME: `${SESSION}/home`, CODEX_HOME: `${SESSION}/home/.codex` },
        stdout: 'ignore',
        stderr: 'ignore',
      },
    );
    const port = this.container.getTcpPort(NATIVE_PORT);
    const forwarded = new Request('http://container/', request);
    forwarded.headers.delete('host');
    forwarded.headers.set('Authorization', `Bearer ${this.nativeToken}`);
    const deadline = Date.now() + 30_000;
    // Use the upgrade for readiness: an empty health response can break the next pooled request.
    // https://github.com/cloudflare/workerd/issues/7597
    // Only connection establishment is retried; protocol commands have not been sent yet.
    for (;;) {
      try {
        return await port.fetch(forwarded);
      } catch (error) {
        if (Date.now() >= deadline) throw error;
        await scheduler.wait(100);
      }
    }
  }

  /** Stop all agent/tool processes and verify none can keep editing files. */
  async stopProcesses() {
    if (!this.container.running) {
      this.process = null;
      this.nativeToken = null;
      return;
    }
    // A terminal Codex event does not prove detached tools stopped. Kill and verify
    // every process of the dedicated uid before admitting a successor or backup.
    await this.exec(['sh', '-c', 'pkill -KILL -u 1000; code=$?; [ "$code" -le 1 ]']);
    if (this.process) {
      await this.process.exitCode;
      this.process = null;
    }
    this.nativeToken = null;
    await this.exec(['sh', '-c', 'pgrep -u 1000 >/dev/null; code=$?; [ "$code" -eq 1 ]']);
  }

  /** Create a new archive without changing the conversation's committed backup. */
  async checkpoint() {
    await this.stopProcesses();
    return this.backups.backup({
      dir: SESSION,
      exclude: ['home/.cache', '**/node_modules', 'home/.codex/auth.json'],
    });
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
