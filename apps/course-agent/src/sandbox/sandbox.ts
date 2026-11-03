import { DirectoryBackup, type DirectoryBackupRecord, Files } from '@cloudflare/sandbox';
import { DurableObject, WorkerEntrypoint } from 'cloudflare:workers';

const SESSION = '/workspace/session';
const NATIVE_PORT = 4500;
export type CourseSource =
  | { type: 'github'; repository: string; branch: string }
  | { type: 'local'; archiveKey: string; directory: string };
const lifetimeMs = (env: Env) =>
  (Number(env.AGENT_TURN_SECONDS) + Number(env.USER_IDLE_SECONDS) + 3600) * 1000;

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

/** Only the conversation's pinned model is available; its API key stays outside the container. */
export class CourseAgentModelOutbound extends WorkerEntrypoint<Env, { model: string }> {
  override async fetch(request: Request) {
    const url = new URL(request.url);
    if (
      url.hostname !== 'model.internal' ||
      url.pathname !== '/v1/responses' ||
      url.search ||
      request.method !== 'POST'
    ) {
      return new Response('Forbidden', { status: 403 });
    }
    const body = (await request.json()) as { model?: string };
    if (body.model !== this.ctx.props.model) return new Response('Forbidden', { status: 403 });
    return fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
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
    config: CourseSource & { model: string },
    checkpoint: DirectoryBackupRecord | null,
  ) {
    if (this.container.running) throw new Error('Refusing to reinitialize a running sandbox');
    this.container.start({ image: this.container.images.courseAgent, enableInternet: false });
    await this.container.setInactivityTimeout(lifetimeMs(this.env));
    if (config.type !== 'local') {
      await this.container.interceptOutboundHttp(
        'repository.internal:80',
        this.ctx.exports.CourseAgentGitHubOutbound({ props: { repository: config.repository } }),
      );
    }
    await this.container.interceptOutboundHttp(
      'model.internal:80',
      this.ctx.exports.CourseAgentModelOutbound({ props: { model: config.model } }),
    );
    await this.exec(['mkdir', '-p', '/workspace']);
    if (checkpoint) {
      await this.backups.restore(checkpoint);
    } else {
      await this.exec(['mkdir', '-p', `${SESSION}/home/.codex`]);
      await this.exec(['chown', '-R', '1000:1000', SESSION]);
      if (config.type === 'local') {
        const archive = await this.env.CHECKPOINTS.get(config.archiveKey);
        if (!archive) throw new Error('The local course snapshot is missing');
        const files = new Files(this.container);
        await files.writeFile('/tmp/course-source.tar.gz', archive.body);
        await this.exec(['mkdir', '-p', `${SESSION}/repository`], 'node');
        await this.exec(
          ['tar', '-xzf', '/tmp/course-source.tar.gz', '-C', `${SESSION}/repository`],
          'node',
        );
        await this.exec(['rm', '/tmp/course-source.tar.gz']);
        await this.exec(['git', 'init', '--initial-branch=local', `${SESSION}/repository`], 'node');
        await this.exec(['git', '-C', `${SESSION}/repository`, 'add', '--all'], 'node');
        await this.exec(
          [
            'git',
            '-C',
            `${SESSION}/repository`,
            '-c',
            'user.name=PrairieLearn',
            '-c',
            'user.email=course-agent@prairielearn.com',
            '-c',
            'commit.gpgsign=false',
            'commit',
            '--allow-empty',
            '-m',
            'Initial local course snapshot',
          ],
          'node',
        );
        // Preserve the original Git paths while keeping the native runner's course path stable.
        await this.exec(
          ['ln', '-s', `repository/${config.directory}`, `${SESSION}/course`],
          'node',
        );
      } else {
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
    }
    // Configuration contains no credentials. It is reapplied after restoration.
    const files = new Files(this.container);
    await files.writeFile(
      `${SESSION}/home/.codex/config.toml`,
      'model_provider = "prairielearn"\n[model_providers.prairielearn]\nname = "PrairieLearn"\nbase_url = "http://model.internal/v1"\nwire_api = "responses"\nsupports_websockets = false\nrequires_openai_auth = false\n',
    );
    await this.exec(['chown', '-R', '1000:1000', `${SESSION}/home`]);
  }

  /** Only private DO callers can upgrade to the runner; no Worker route exposes this port. */
  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('WebSocket required', { status: 426 });
    }
    if (!this.container.running) throw new Error('Native runner has no live workspace');
    // A fresh connection follows workspace startup or Conversation DO recovery. Replace any
    // orphaned runner before reconnecting; ordinary turns reuse the existing connection.
    await this.stopProcesses();
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
    // every process of the dedicated uid for explicit Stop, recovery, or backup.
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
