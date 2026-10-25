import type { UIMessageChunk } from 'ai';
import { type MessageConnection, ParameterStructures } from 'vscode-jsonrpc/browser';

import { notifications, requests } from '../generated/protocol.js';
import type { AgentMessageDeltaNotification } from '../generated/types/v2/AgentMessageDeltaNotification.js';

import { createCodexConnection } from './codex-connection.js';
import type { CourseSandbox } from './sandbox.js';

/** One app-server connection and its conversion into the chat SDK's output format. */
export class CodexAppServerClient {
  private rpc: MessageConnection | null = null;
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
    const rpc = createCodexConnection(socket, (error) => this.fail(error));
    this.rpc = rpc;
    const onNotification = <P>(
      event: { method: string; params: (value: unknown) => value is P },
      handler: (params: P) => void,
    ) =>
      rpc.onNotification(event.method, (value: unknown) => {
        try {
          if (!event.params(value)) throw new Error(`Invalid notification: ${event.method}`);
          handler(value);
        } catch (error) {
          this.fail(error instanceof Error ? error : new Error(String(error)));
        }
      });
    rpc.listen();
    onNotification(notifications['item/agentMessage/delta'], (params) =>
      this.delta('text', params),
    );
    onNotification(notifications['item/reasoning/summaryTextDelta'], (params) =>
      this.delta('reasoning', params),
    );
    onNotification(notifications['turn/completed'], (params) => {
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
    await this.request(requests.initialize, {
      clientInfo: { name: 'prairielearn', title: 'PrairieLearn', version: '1' },
      capabilities: { experimentalApi: true, requestAttestation: false },
    });
    await rpc.sendNotification('initialized');
  }

  private get connection() {
    if (!this.rpc) throw new Error('Native runner is not connected');
    return this.rpc;
  }

  private fail(error: Error) {
    this.terminal.reject(error);
    this.rpc?.dispose();
  }

  private async request<P, R>(
    method: {
      method: string;
      params: (value: unknown) => value is P;
      result: (value: unknown) => value is R;
    },
    params: NoInfer<P>,
  ): Promise<R> {
    if (!method.params(params)) throw new Error(`Invalid parameters for ${method.method}`);
    const connection = this.connection;
    // A timeout means acceptance is unknown. Dispose pending work without replaying the command.
    const timeout = setTimeout(
      () => this.fail(new Error(`Native command did not settle: ${method.method}`)),
      30_000,
    );
    try {
      const result = await connection.sendRequest<unknown>(
        method.method,
        ParameterStructures.byName,
        params,
      );
      if (!method.result(result)) {
        const error = new Error(`Invalid result for ${method.method}`);
        this.fail(error);
        throw error;
      }
      return result;
    } finally {
      clearTimeout(timeout);
    }
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
      ? await this.request(requests['thread/resume'], {
          ...settings,
          threadId: config.threadId,
          excludeTurns: true,
        })
      : await this.request(requests['thread/start'], settings);
    this.threadId = result.thread.id;
    return result.thread.id;
  }

  async run(text: string, accepted: (turnId: string) => void) {
    const result = await this.request(requests['turn/start'], {
      threadId: this.threadId!,
      input: [{ type: 'text', text, text_elements: [] }],
    });
    this.turnId = result.turn.id;
    accepted(this.turnId);
  }

  async interrupt() {
    if (!this.turnId) throw new Error('Native turn acceptance is unknown');
    await this.request(requests['turn/interrupt'], {
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
    this.rpc?.dispose();
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
