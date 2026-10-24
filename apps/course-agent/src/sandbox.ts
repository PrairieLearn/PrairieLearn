import { DirectoryBackup, type DirectoryBackupRecord, Files } from '@cloudflare/sandbox';
import { DurableObject, WorkerEntrypoint } from 'cloudflare:workers';

const SESSION = '/workspace/session';
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
  }

  /** Start the private stdio bridge; this does not submit a prompt. */
  async openNative(): Promise<Response> {
    if (!this.container.running || this.process) {
      throw new Error('Native runner is unavailable or already connected');
    }
    this.process = await this.container.exec(['node', '/opt/course-agent/relay.mjs'], {
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'ignore',
    });
    return new Response(this.process.stdout);
  }

  /** Send one protocol message through the existing private process connection. */
  async command(frame: string) {
    if (!this.process?.stdin) throw new Error('Native runner connection was lost');
    const writer = this.process.stdin.getWriter();
    try {
      await writer.write(new TextEncoder().encode(`${frame}\n`));
    } finally {
      writer.releaseLock();
    }
  }

  /** Stop all agent/tool processes and verify none can keep editing files. */
  async stopProcesses() {
    if (!this.container.running) {
      this.process = null;
      return;
    }
    // A terminal Codex event does not prove detached tools stopped. Kill and verify
    // every process of the dedicated uid before admitting a successor or backup.
    await this.exec(['sh', '-c', 'pkill -KILL -u 1000; code=$?; [ "$code" -le 1 ]']);
    if (this.process) {
      await this.process.exitCode;
      this.process = null;
    }
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
  }
}
