import { DirectoryBackup, type DirectoryBackupRecord, Files } from '@cloudflare/sandbox';
import { DurableObject, WorkerEntrypoint } from 'cloudflare:workers';
import { z } from 'zod';

import { logEvent, redactSecrets } from '../monitoring.js';

const SESSION = '/workspace/session';
const NATIVE_PORT = 4500;
export type CourseSource =
  | { type: 'github'; repository: string; branch: string }
  | { type: 'local'; archiveKey: string; directory: string };
// Named Cloudflare instance types, or a custom size (Enterprise plans).
// https://developers.cloudflare.com/containers/platform-details/limits/
const InstanceTypeSchema = z.union([
  z.enum(['lite', 'basic', 'standard-1', 'standard-2', 'standard-3', 'standard-4']),
  z.object({
    vcpu: z.number().positive(),
    memoryMib: z.number().int().positive(),
    diskMb: z.number().int().positive(),
  }),
]);

// The config contains no credentials or repository data. Features the course agent doesn't use are
// off, using Codex 0.163.0's flag names, so the runner doesn't start or advertise them.
const CODEX_CONFIG = `model_provider = "prairielearn"
[model_providers.prairielearn]
name = "PrairieLearn"
base_url = "http://model.internal/v1"
wire_api = "responses"
supports_websockets = false
requires_openai_auth = false
[features]
${[
  'apps',
  'browser_annotation_api',
  'browser_use',
  'browser_use_external',
  'browser_use_full_cdp_access',
  'code_mode_host',
  'computer_use',
  'daemon_auto_start',
  'goals',
  'guardian_approval',
  'hooks',
  'image_generation',
  'in_app_browser',
  'in_app_chat',
  'in_app_dictation',
  'in_app_local_automation',
  'in_app_updates',
  'in_app_voice',
  'multi_agent',
  'plugin_sharing',
  'plugins',
  'realtime_conversation',
  'remote_plugin',
  'shell_snapshot',
  'skill_mcp_dependency_install',
  'tool_suggest',
  'worktrees',
]
  .map((feature) => `${feature} = false\n`)
  .join('')}`;

// Cloudflare's maximum time a container can stay disconnected from its Durable Object.
// AGENT_TURN_SECONDS + USER_IDLE_SECONDS must fit within it.
const MAX_CONTAINER_INACTIVITY_SECONDS = 6 * 60 * 60;

// Codex output can contain sensitive content, so stderr is forwarded only when DEBUG_RUNNER_OUTPUT
// is "true" (staging only), capped in case a runner repeats an error.
const RUNNER_LOG_LINES = 200;
const RUNNER_LOG_CHARS = 2000;

/** Forward runner stderr to Worker logs and keep a short tail for startup errors. */
function forwardRunnerStderr(stream: ReadableStream) {
  let lines = 0;
  let tail = '';
  const done = (async () => {
    try {
      for await (const chunk of stream.pipeThrough(new TextDecoderStream())) {
        tail = (tail + chunk).slice(-RUNNER_LOG_CHARS);
        for (const line of chunk.split('\n')) {
          if (line && ++lines <= RUNNER_LOG_LINES) {
            console.warn(`[codex stderr] ${redactSecrets(line.slice(0, RUNNER_LOG_CHARS))}`);
          }
        }
      }
    } catch {
      // The stream errors when the container stops; the runner's exit is handled by the caller.
    }
  })();
  return { done, tail: () => redactSecrets(tail.trim()) };
}

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
export class CourseAgentModelOutbound extends WorkerEntrypoint<
  Env,
  { model: string; sandboxId: string }
> {
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
    const body = (await request.json()) as { model?: string; input?: { role?: string }[] };
    if (body.model !== this.ctx.props.model) return new Response('Forbidden', { status: 403 });
    // Later requests in a turn end with tool output; only the role is read, never the content.
    const firstOfTurn = body.input?.at(-1)?.role === 'user';
    const started = Date.now();
    if (firstOfTurn) logEvent('model_request_sent', { sandboxId: this.ctx.props.sandboxId });
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      redirect: 'manual',
    });
    if (firstOfTurn) {
      logEvent('model_response_started', {
        sandboxId: this.ctx.props.sandboxId,
        status: response.status,
        elapsedMs: Date.now() - started,
      });
    }
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

  private async exec(args: string[], user = 'root', env?: Record<string, string>) {
    const result = await (await this.container.exec(args, { user, env })).output();
    if (result.exitCode !== 0) {
      throw new Error(`Sandbox command failed: ${new TextDecoder().decode(result.stderr)}`);
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
    const started = Date.now();
    const log = (event: string, fields: Record<string, unknown> = {}) =>
      logEvent(event, { sandboxId: this.ctx.id.name, elapsedMs: Date.now() - started, ...fields });
    const instance = InstanceTypeSchema.parse(
      this.env.SANDBOX_INSTANCE_TYPE.startsWith('{')
        ? JSON.parse(this.env.SANDBOX_INSTANCE_TYPE)
        : this.env.SANDBOX_INSTANCE_TYPE,
    );
    // The default `lite` (256 MiB) is too small for Codex and course tooling, and running out of
    // memory restarts the instance, losing unsaved edits.
    this.container.start({
      image: this.container.images.courseAgent,
      enableInternet: false,
      instance,
    });
    await this.container.setInactivityTimeout(MAX_CONTAINER_INACTIVITY_SECONDS * 1000);
    // One exec runs the image's setup script. It is the container's first exec, so its round trip
    // minus the script's own time approximates how long the container took to start.
    const setup = async (mode: 'fresh' | 'restore' | 'configure') => {
      const execStarted = Date.now();
      const { stdout } = await this.exec(['/usr/local/bin/course-agent-setup', mode], 'root', {
        CODEX_CONFIG,
      });
      const report = Object.fromEntries(
        new TextDecoder()
          .decode(stdout)
          .trim()
          .split('\n')
          .map((line) => line.split('=')),
      ) as Record<'memTotalKb' | 'cpus' | 'setupMs', string>;
      return { ...report, execMs: Date.now() - execStarted };
    };
    const first = await setup(checkpoint ? 'restore' : 'fresh');
    // Memory and CPU count confirm which instance type actually applied.
    log('sandbox_started', {
      instance: typeof instance === 'string' ? instance : JSON.stringify(instance),
      memTotalKb: Number(first.memTotalKb),
      cpus: Number(first.cpus),
      containerStartMs: first.execMs - Number(first.setupMs),
      setupMs: Number(first.setupMs),
    });
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
      log('sandbox_restore_started');
      await this.backups.restore(checkpoint);
      log('sandbox_restore_finished');
      // The Codex config is reapplied after restoration.
      await setup('configure');
    }
    this.freshContainer = true;
    log('sandbox_codex_config_written');
  }

  /** Unpack the local snapshot or clone the repository into a freshly prepared workspace. */
  async addCourseFiles(config: CourseSource) {
    const started = Date.now();
    const log = (event: string, fields: Record<string, unknown> = {}) =>
      logEvent(event, { sandboxId: this.ctx.id.name, elapsedMs: Date.now() - started, ...fields });
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
      await this.exec(['ln', '-s', `repository/${config.directory}`, `${SESSION}/course`], 'node');
    } else {
      log('sandbox_clone_started', { repository: config.repository, branch: config.branch });
      // Only the tip is needed: reviews diff against the cloned branch tip, and nothing fetches
      // later. Full history made large course repositories take most of startup to clone.
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
        'node',
      );
      log('sandbox_clone_finished');
    }
    log('sandbox_files_ready', { source: config.type });
  }

  /** Only private DO callers can upgrade to the runner; no Worker route exposes this port. */
  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('WebSocket required', { status: 426 });
    }
    if (!this.container.running) throw new Error('Native runner has no live workspace');
    // A fresh connection follows workspace startup or Conversation DO recovery. Replace any
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
    // Temporary: forwards Codex output to diagnose staging sandbox startup. Remove this flag and
    // the forwarding once that is resolved; production must never set it.
    const debugOutput = this.env.DEBUG_RUNNER_OUTPUT === 'true';
    const started = Date.now();
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
        // Threads set their own cwd to the course. Home exists before course files are added, so
        // the runner can start while the repository is still being cloned.
        cwd: `${SESSION}/home`,
        env: { HOME: `${SESSION}/home`, CODEX_HOME: `${SESSION}/home/.codex` },
        stdout: 'ignore',
        stderr: debugOutput ? 'pipe' : 'ignore',
      },
    );
    logEvent('runner_started', {
      sandboxId: this.ctx.id.name,
      pid: this.process.pid,
      elapsedMs: Date.now() - started,
    });
    const stderr = this.process.stderr ? forwardRunnerStderr(this.process.stderr) : null;
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
        // A runner that is still alive never closes stderr, so only briefly wait for its tail.
        if (stderr) await Promise.race([stderr.done, scheduler.wait(1000)]);
        const facts = JSON.stringify({
          elapsedMs: Date.now() - started,
          failures,
          exitCode,
          containerRunning: this.container.running,
        });
        const tail = stderr ? `: ${stderr.tail() || '(no stderr)'}` : '';
        throw new Error(`Codex runner did not listen: ${facts}${tail}`, { cause: error });
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
