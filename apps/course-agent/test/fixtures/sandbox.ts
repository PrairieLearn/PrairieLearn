/* eslint-disable unicorn/no-error-property-assignment -- Fixtures reproduce SDK errors after RPC serialization. */
import { DurableObject } from 'cloudflare:workers';

import type { ThreadItem } from '../../src/generated/v2/ThreadItem.js';
import type { Turn } from '../../src/generated/v2/Turn.js';

interface State {
  files: Record<string, string>;
  waitingTool?: boolean;
  waitingToolCalls?: string[];
  captureDelay?: number;
  toolResults?: unknown[];
  backup?: Record<string, string>;
  backupEvents: string[];
  running: boolean;
  launches: number;
  restores: number;
  destroys: number;
  turns: Turn[];
  steers: number;
  failBackup?: boolean;
  destroyFailures?: number;
  ignoreCancellation?: boolean;
  dropStartAck?: boolean;
  failLaunch?: boolean;
  launchDelay?: number;
  steerBehavior?: 'finish' | 'lose-ack' | 'reject';
}
const textItem = (id: string, text: string): ThreadItem => ({
  type: 'agentMessage',
  id,
  text,
  phase: null,
  memoryCitation: null,
  delivery: null,
  questions: null,
});
const command = (status: 'inProgress' | 'completed'): ThreadItem => ({
  type: 'commandExecution',
  id: 'cmd',
  command: 'sleep 8',
  cwd: '/workspace/repo',
  pluginId: null,
  scriptPath: null,
  processId: null,
  source: 'agent',
  status,
  commandActions: [],
  aggregatedOutput: status === 'completed' ? 'done' : null,
  exitCode: status === 'completed' ? 0 : null,
  durationMs: null,
});

// Persisted fake execution survives replacement of the PL webserver or Worker.
// Only the Linux/app-server boundary is substituted; Chat and AIChatAgent are real.
export class TestSandbox extends DurableObject {
  private sockets = new Set<WebSocket>();
  private async state(): Promise<State> {
    return (
      (await this.ctx.storage.get<State>('state')) ?? {
        files: {},
        backupEvents: [],
        running: false,
        launches: 0,
        restores: 0,
        destroys: 0,
        turns: [],
        steers: 0,
      }
    );
  }

  private save(state: State) {
    return this.ctx.storage.put('state', state);
  }

  private emit(method: string, params: object) {
    for (const socket of this.sockets) socket.send(JSON.stringify({ method, params }));
  }

  async setOutboundByHost(_host: string, _handler: string, _params: unknown) {}
  async structuredFailure() {
    throw Object.assign(new Error('signed-url-secret'), {
      name: 'InvalidBackupConfigError',
      code: 'INVALID_BACKUP_CONFIG',
    });
  }

  async fetch(request: Request) {
    const state = await this.state();
    if (
      !state.running ||
      state.waitingTool ||
      request.headers.get('Authorization') !==
        `Bearer ${state.files['/tmp/codex-app-server-token']}`
    ) {
      return new Response('Unauthorized', { status: 401 });
    }
    const [client, server] = Object.values(new WebSocketPair());
    server.accept();
    this.sockets.add(server);
    server.addEventListener('close', () => this.sockets.delete(server));
    server.addEventListener('message', (event) => {
      const frame = JSON.parse(String(event.data));
      if (!frame.method && String(frame.id).startsWith('approval-call')) {
        void this.acceptToolResult(frame.result, frame.id);
        return;
      }
      void this.rpc(frame.method, frame.params ?? {})
        .then(async (result) => {
          const state = await this.state();
          if (frame.method === 'turn/start' && state.dropStartAck) {
            state.dropStartAck = false;
            await this.save(state);
            await this.disconnect();
            return;
          }
          if (frame.method === 'turn/steer' && state.steerBehavior === 'lose-ack') {
            state.steerBehavior = undefined;
            await this.save(state);
            await this.disconnect();
            return;
          }
          if (frame.id !== undefined) server.send(JSON.stringify({ id: frame.id, result }));
        })
        .catch((error) => {
          if (frame.id !== undefined) {
            server.send(
              JSON.stringify({
                id: frame.id,
                error: { code: -32000, message: String(error) },
              }),
            );
          }
        });
    });
    return new Response(null, { status: 101, webSocket: client });
  }

  private async rpc(
    method: string,
    params: {
      threadId?: string;
      turnId?: string;
      expectedTurnId?: string;
      clientUserMessageId?: string;
    },
  ) {
    await this.completeIfDue();
    const state = await this.state();
    const current = state.turns.at(-1);
    switch (method) {
      case 'initialize':
        return { userAgent: 'fixture' };
      case 'initialized':
        return {};
      case 'thread/start':
        state.files['/workspace/codex/session'] = 'native-thread';
        await this.save(state);
        return { thread: { id: 'native-thread', turns: state.turns } };
      case 'thread/resume':
      case 'thread/read':
        if (!state.files['/workspace/codex/session']) throw new Error('Native session missing');
        return { thread: { id: 'native-thread', turns: state.turns } };
      case 'turn/start': {
        if (current?.status === 'inProgress') throw new Error('Already running');
        const turn: Turn = {
          id: crypto.randomUUID(),
          status: 'inProgress',
          items: [
            textItem('start', 'Started. '),
            command('inProgress'),
            {
              type: 'userMessage',
              id: crypto.randomUUID(),
              clientId: params.clientUserMessageId ?? null,
              content: [],
            },
          ],
          itemsView: 'full',
          error: null,
          startedAt: Date.now() / 1000,
          completedAt: null,
          durationMs: null,
        };
        state.turns.push(turn);
        await this.save(state);
        await this.ctx.storage.setAlarm(Date.now() + 8_000);
        if (!state.dropStartAck) this.emit('turn/started', { threadId: 'native-thread', turn });
        const tokens = {
          inputTokens: 100 * state.turns.length,
          cachedInputTokens: 0,
          cacheWriteInputTokens: 0,
          outputTokens: 20 * state.turns.length,
          totalTokens: 120 * state.turns.length,
          reasoningOutputTokens: 0,
        };
        this.emit('thread/tokenUsage/updated', {
          threadId: 'native-thread',
          turnId: turn.id,
          tokenUsage: { total: tokens, last: tokens, modelContextWindow: 100000 },
        });
        this.emit('item/completed', {
          threadId: 'native-thread',
          turnId: turn.id,
          item: turn.items[0],
        });
        this.emit('item/started', {
          threadId: 'native-thread',
          turnId: turn.id,
          item: turn.items[1],
        });
        return { turn };
      }
      case 'turn/steer':
        if (state.steerBehavior === 'finish' && current?.status === 'inProgress') {
          state.steerBehavior = undefined;
          current.status = 'completed';
          await this.save(state);
          this.emit('turn/completed', {
            threadId: 'native-thread',
            turn: current,
          });
          throw new Error('No active turn to steer');
        }
        if (state.steerBehavior === 'reject') {
          state.steerBehavior = undefined;
          await this.save(state);
          throw new Error('Fixture rejected steering');
        }
        if (current?.status !== 'inProgress' || current.id !== params.expectedTurnId) {
          throw new Error('Stale steering');
        }
        state.steers++;
        current.items.push({
          type: 'userMessage',
          id: crypto.randomUUID(),
          clientId: params.clientUserMessageId ?? null,
          content: [],
        });
        await this.save(state);
        return { turnId: current.id };
      case 'turn/interrupt':
        if (
          current?.status === 'inProgress' &&
          current.id === params.turnId &&
          !state.ignoreCancellation
        ) {
          current.status = 'interrupted';
          await this.save(state);
          this.emit('turn/completed', {
            threadId: 'native-thread',
            turn: current,
          });
        }
        return {};
      default:
        throw new Error(`Unsupported method ${method}`);
    }
  }

  private async completeIfDue() {
    const state = await this.state();
    const turn = state.turns.at(-1);
    if (
      !state.running ||
      state.waitingTool ||
      state.ignoreCancellation ||
      turn?.status !== 'inProgress' ||
      Date.now() < turn.startedAt! * 1000 + 8000
    ) {
      return;
    }
    turn.status = 'completed';
    turn.items = [
      textItem('start', 'Started. '),
      command('completed'),
      textItem('finish', 'Finished.'),
      ...turn.items.filter(
        (item) => item.type === 'userMessage' || item.type === 'dynamicToolCall',
      ),
    ];
    await this.save(state);
    for (const item of turn.items.slice(1)) {
      this.emit('item/completed', {
        threadId: 'native-thread',
        turnId: turn.id,
        item,
      });
    }
    this.emit('turn/completed', { threadId: 'native-thread', turn });
  }

  async alarm() {
    await this.completeIfDue();
  }

  async exists(path: string) {
    return { exists: path in (await this.state()).files };
  }

  async writeFile(path: string, content: string) {
    const state = await this.state();
    state.files[path] = content;
    await this.save(state);
  }

  async readFile(path: string) {
    const content = (await this.state()).files[path];
    if (content === undefined) throw new Error(`Missing fixture file: ${path}`);
    return { content };
  }

  async deleteFile(path: string) {
    const state = await this.state();
    delete state.files[path];
    await this.save(state);
  }

  async reportUsage(usage: { input: number; cached: number; cacheWrite: number; output: number }) {
    const state = await this.state();
    const breakdown = {
      inputTokens: usage.input,
      cachedInputTokens: usage.cached,
      cacheWriteInputTokens: usage.cacheWrite,
      outputTokens: usage.output,
      reasoningOutputTokens: 0,
      totalTokens: usage.input + usage.output,
    };
    this.emit('thread/tokenUsage/updated', {
      threadId: 'native-thread',
      turnId: state.turns.at(-1)!.id,
      tokenUsage: { total: breakdown, last: breakdown },
    });
  }

  async exec(command: string) {
    const path = command.match(/(\/tmp\/approval-[\w-]+\.json)/)?.[1];
    if (path) {
      const delay = (await this.state()).captureDelay;
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      await this.writeFile(
        path,
        JSON.stringify({
          diff: 'diff --git a/hello.txt b/hello.txt\n--- a/hello.txt\n+++ b/hello.txt\n@@ -1 +1 @@\n-old\n+new\n',
          files: [
            {
              path: 'hello.txt',
              content: 'new\n',
              previousMode: '100644',
              mode: '100644',
            },
          ],
        }),
      );
    }
    return {
      success: true,
      stdout:
        'diff --git a/hello.txt b/hello.txt\n--- a/hello.txt\n+++ b/hello.txt\n@@ -1 +1 @@\n-old\n+new\n',
    };
  }

  async requestApproval(
    tool = 'push_sync',
    args: Record<string, string> = {
      baseSha: 'a'.repeat(40),
      proposedSha: 'b'.repeat(40),
    },
    count = 1,
    captureDelay = 0,
  ) {
    const state = await this.state();
    state.waitingTool = true;
    state.captureDelay = captureDelay;
    const calls = Array.from({ length: count }, (_, index) =>
      index === 0 ? 'approval-call' : `approval-call-${index}`,
    );
    state.waitingToolCalls = [...(state.waitingToolCalls ?? []), ...calls];
    const items: ThreadItem[] = calls.map((id) => ({
      type: 'dynamicToolCall',
      id,
      namespace: null,
      tool,
      arguments: args,
      status: 'inProgress',
      contentItems: null,
      success: null,
      durationMs: null,
    }));
    state.turns.at(-1)!.items.push(...items);
    await this.save(state);
    for (const item of items) {
      this.emit('item/started', {
        threadId: 'native-thread',
        turnId: state.turns.at(-1)!.id,
        item,
      });
      for (const socket of this.sockets) {
        socket.send(
          JSON.stringify({
            id: item.id,
            method: 'item/tool/call',
            params: {
              threadId: 'native-thread',
              turnId: state.turns.at(-1)!.id,
              callId: item.id,
              namespace: null,
              tool,
              arguments: args,
            },
          }),
        );
      }
    }
  }

  private async acceptToolResult(
    result: {
      success: boolean;
      contentItems: Extract<ThreadItem, { type: 'dynamicToolCall' }>['contentItems'];
    },
    callId: string,
  ) {
    const state = await this.state();
    state.toolResults = [...(state.toolResults ?? []), { ...result, callId }];
    state.waitingToolCalls = state.waitingToolCalls?.filter((id) => id !== callId);
    state.waitingTool = !!state.waitingToolCalls?.length;
    const turn = state.turns.at(-1)!;
    const item = turn.items.find((item) => item.id === callId);
    if (item?.type === 'dynamicToolCall') {
      Object.assign(item, result, { status: 'completed' });
      this.emit('item/completed', {
        threadId: 'native-thread',
        turnId: turn.id,
        item,
      });
    }
    await this.save(state);
    await this.ctx.storage.setAlarm(Math.max(Date.now() + 100, turn.startedAt! * 1000 + 8000));
  }

  async startProcess(_command: string, _options: { processId: string }) {
    const state = await this.state();
    if (state.failLaunch) {
      state.failLaunch = false;
      await this.save(state);
      throw new Error('Fixture launch failed');
    }
    if (state.launchDelay) {
      const delay = state.launchDelay;
      state.launchDelay = undefined;
      await this.save(state);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    if (state.running) throw new Error('Duplicate launch');
    state.running = true;
    state.launches++;
    await this.save(state);
  }

  async getProcess(id: string) {
    return (await this.state()).running ? { id, status: 'running' } : null;
  }

  async cleanupCompletedProcesses() {}
  async setSteerBehavior(behavior: State['steerBehavior']) {
    const state = await this.state();
    state.steerBehavior = behavior;
    await this.save(state);
  }

  async configureLaunch(options: { failLaunch?: boolean; launchDelay?: number }) {
    await this.save({ ...(await this.state()), ...options });
  }

  async dropNextStartAck() {
    const state = await this.state();
    state.dropStartAck = true;
    await this.save(state);
  }

  async ignoreCancellation() {
    const state = await this.state();
    state.ignoreCancellation = true;
    await this.save(state);
  }

  async failNextBackup() {
    const state = await this.state();
    state.failBackup = true;
    await this.save(state);
  }

  async createBackup() {
    const state = await this.state();
    if (state.turns.at(-1)?.status === 'inProgress' && state.running) {
      throw new Error('Checkpoint while turn active');
    }
    if (state.failBackup) {
      state.backupEvents.push('backup-failed');
      state.failBackup = false;
      await this.save(state);
      throw new Error('Fixture R2 unavailable');
    }
    state.backupEvents.push('backup');
    state.backup = Object.fromEntries(
      Object.entries(state.files).filter(([path]) => path.startsWith('/workspace/')),
    );
    const id = crypto.randomUUID();
    const bucket = (this.env as { BACKUP_BUCKET: R2Bucket }).BACKUP_BUCKET;
    await bucket.put(`backups/${id}/data.sqsh`, JSON.stringify(state.backup));
    await bucket.put(`backups/${id}/meta.json`, JSON.stringify({ id }));
    await this.save(state);
    return { id, dir: '/workspace' };
  }

  async restoreBackup(backup: { id: string }) {
    const state = await this.state();
    const bucket = (this.env as { BACKUP_BUCKET: R2Bucket }).BACKUP_BUCKET;
    const archive = await bucket.get(`backups/${backup.id}/data.sqsh`);
    if (!archive) {
      throw Object.assign(new Error('No backup'), {
        name: 'BackupNotFoundError',
      });
    }
    state.files = await archive.json<Record<string, string>>();
    state.restores++;
    // The saved native session is idle. Work lost since that checkpoint is not replayed.
    state.turns = state.turns.filter((turn) => turn.status !== 'inProgress');
    await this.save(state);
  }

  async disconnect() {
    for (const socket of this.sockets) socket.close(1000, 'Fixture disconnect');
    this.sockets.clear();
  }

  async sleep() {
    const state = await this.state();
    state.running = false;
    state.files = {};
    await this.save(state);
    await this.disconnect();
  }

  async failDestroy(attempts: number) {
    const state = await this.state();
    state.destroyFailures = attempts;
    await this.save(state);
  }

  async destroy() {
    const state = await this.state();
    state.destroys++;
    state.backupEvents.push(state.destroyFailures ? 'destroy-failed' : 'destroy');
    if (state.destroyFailures) {
      state.destroyFailures--;
      await this.save(state);
      throw new Error('Fixture destroy unavailable');
    }
    state.files = {};
    state.waitingTool = false;
    state.running = false;
    state.ignoreCancellation = false;
    await this.save(state);
    await this.ctx.storage.deleteAlarm();
    await this.disconnect();
  }

  async backupEvents() {
    return (await this.state()).backupEvents;
  }

  async inspect() {
    const { launches, restores, destroys, running, steers, turns, toolResults } =
      await this.state();
    return {
      launches,
      restores,
      destroys,
      running,
      steers,
      turns: turns.length,
      toolResults,
    };
  }
}
