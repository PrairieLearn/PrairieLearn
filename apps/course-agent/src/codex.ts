import type { UIMessageChunk } from 'ai';

import { notifications, requests } from '../generated/protocol.js';
import type { AgentMessageDeltaNotification } from '../generated/types/v2/AgentMessageDeltaNotification.js';

import { RpcConnection } from './rpc.js';
import type { CourseSandbox } from './sandbox.js';

/** One app-server connection and its conversion into the chat SDK's output format. */
export class CodexAppServerClient {
  private rpc: RpcConnection | null = null;
  private controller: ReadableStreamDefaultController<UIMessageChunk> | null = null;
  private terminal = Promise.withResolvers<undefined>();
  private turnId: string | null = null;
  private threadId: string | null = null;
  private parts = new Map<string, 'text' | 'reasoning'>();
  readonly stream: ReadableStream<UIMessageChunk>;

  constructor(
    private sandbox: DurableObjectStub<CourseSandbox>,
    messageId: string,
  ) {
    // Setup can fail before the execution helper starts waiting for completion.
    void this.terminal.promise.catch(() => {});
    this.stream = new ReadableStream<UIMessageChunk>({
      start: (controller) => {
        this.controller = controller;
        controller.enqueue({ type: 'start', messageId });
      },
      // The SDK may cancel its reader before native execution has stopped.
      cancel: () => {
        this.controller = null;
      },
    });
  }

  async connect() {
    const response = await this.sandbox.fetch('http://codex.internal/', {
      headers: { Upgrade: 'websocket' },
    });
    if (response.status !== 101 || !response.webSocket) {
      throw new Error('Native runner supplied no WebSocket');
    }
    const socket = response.webSocket;
    const rpc = new RpcConnection(socket, (error) => this.terminal.reject(error));
    this.rpc = rpc;
    rpc.onNotification(notifications['item/agentMessage/delta'], (params) =>
      this.delta('text', params),
    );
    rpc.onNotification(notifications['item/reasoning/summaryTextDelta'], (params) =>
      this.delta('reasoning', params),
    );
    rpc.onNotification(notifications['turn/completed'], (params) => {
      if (params.threadId !== this.threadId || (this.turnId && params.turn.id !== this.turnId)) {
        return;
      }
      if (params.turn.status === 'failed') {
        this.terminal.reject(new Error(params.turn.error?.message ?? 'Native turn failed'));
      } else if (params.turn.status === 'completed' || params.turn.status === 'interrupted') {
        this.terminal.resolve(undefined);
      }
    });
    socket.accept();
    await rpc.request(requests.initialize, {
      clientInfo: { name: 'prairielearn', title: 'PrairieLearn', version: '1' },
      capabilities: null,
    });
    rpc.notify('initialized');
  }

  private get connection() {
    if (!this.rpc) throw new Error('Native runner is not connected');
    return this.rpc;
  }

  async thread(config: { model: string; instructions: string; threadId: string | null }) {
    const settings = {
      model: config.model,
      cwd: '/workspace/session/course',
      approvalPolicy: 'never' as const,
      sandbox: 'danger-full-access' as const,
      developerInstructions: config.instructions,
    };
    const result = config.threadId
      ? await this.connection.request(requests['thread/resume'], {
          ...settings,
          threadId: config.threadId,
          excludeTurns: true,
        })
      : await this.connection.request(requests['thread/start'], settings);
    this.threadId = result.thread.id;
    return result.thread.id;
  }

  async run(text: string, accepted: (turnId: string) => void) {
    const result = await this.connection.request(requests['turn/start'], {
      threadId: this.threadId!,
      input: [{ type: 'text', text, text_elements: [] }],
    });
    this.turnId = result.turn.id;
    accepted(this.turnId);
  }

  async interrupt() {
    if (!this.turnId) throw new Error('Native turn acceptance is unknown');
    await this.connection.request(requests['turn/interrupt'], {
      threadId: this.threadId!,
      turnId: this.turnId,
    });
    const timeout = AbortSignal.timeout(30_000);
    const expired = Promise.withResolvers<never>();
    const fail = () => expired.reject(new Error('Native interruption did not settle'));
    timeout.addEventListener('abort', fail, { once: true });
    try {
      await Promise.race([this.terminal.promise, expired.promise]);
    } finally {
      timeout.removeEventListener('abort', fail);
    }
  }

  get finished() {
    return this.terminal.promise;
  }

  private delta(type: 'text' | 'reasoning', params: AgentMessageDeltaNotification) {
    if (
      params.threadId !== this.threadId ||
      (this.turnId && params.turnId !== this.turnId) ||
      !this.controller
    ) {
      return;
    }
    const id = `${type}:${params.itemId}`;
    if (!this.parts.has(id)) {
      this.parts.set(id, type);
      this.controller.enqueue({ type: type === 'text' ? 'text-start' : 'reasoning-start', id });
    }
    this.controller.enqueue({
      type: type === 'text' ? 'text-delta' : 'reasoning-delta',
      id,
      delta: params.delta,
    });
  }

  closeStream(error?: unknown) {
    if (error) this.terminal.reject(error);
    this.rpc?.close(error instanceof Error ? error : undefined);
    if (!this.controller) return;
    for (const [id, type] of this.parts) {
      this.controller.enqueue({ type: type === 'text' ? 'text-end' : 'reasoning-end', id });
    }
    if (error) {
      this.controller.enqueue({
        type: 'error',
        errorText:
          'The course agent stopped unexpectedly. Resume the conversation to recover your workspace.',
      });
    }
    this.controller.enqueue({ type: 'finish' });
    this.controller.close();
    this.controller = null;
  }
}
