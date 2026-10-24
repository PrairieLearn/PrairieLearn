import type { UIMessageChunk } from 'ai';

import type { ClientRequest } from '../generated/types/ClientRequest.js';
import type { InitializeResponse } from '../generated/types/InitializeResponse.js';
import type { ServerNotification } from '../generated/types/ServerNotification.js';
import type { ServerRequest } from '../generated/types/ServerRequest.js';
import type { ThreadResumeResponse } from '../generated/types/v2/ThreadResumeResponse.js';
import type { ThreadStartResponse } from '../generated/types/v2/ThreadStartResponse.js';
import type { TurnStartResponse } from '../generated/types/v2/TurnStartResponse.js';

import type { CourseSandbox } from './sandbox.js';

type Sandbox = DurableObjectStub<CourseSandbox>;

/** One private app-server connection; no native output is reattached after a restart. */
export class Codex {
  private nextId = 0;
  private pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();

  private controller: ReadableStreamDefaultController<UIMessageChunk> | null = null;
  private terminal = Promise.withResolvers<undefined>();
  private turnId: string | null = null;
  private parts = new Map<string, 'text' | 'reasoning'>();
  private threadId: string | null = null;

  constructor(private sandbox: Sandbox) {}

  async connect() {
    const response = await this.sandbox.openNative();
    if (!response.body) throw new Error('Native runner supplied no output');
    void this.read(response.body).catch((error: unknown) => {
      const failure = error instanceof Error ? error : new Error(String(error));
      for (const pending of this.pending.values()) pending.reject(failure);
      this.pending.clear();
      this.terminal.reject(failure);
    });
    // Attach immediately: setup can fail before anyone waits for terminal output.
    void this.terminal.promise.catch(() => {});
    await this.request<InitializeResponse, 'initialize'>('initialize', {
      clientInfo: { name: 'prairielearn', title: 'PrairieLearn', version: '1' },
      capabilities: null,
    });
    await this.sandbox.command(JSON.stringify({ method: 'initialized' }));
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
      ? await this.request<ThreadResumeResponse, 'thread/resume'>('thread/resume', {
          ...settings,
          threadId: config.threadId,
        })
      : await this.request<ThreadStartResponse, 'thread/start'>('thread/start', settings);
    this.threadId = result.thread.id;
    return result.thread.id;
  }

  async run(text: string, messageId: string, accepted: (turnId: string) => void) {
    const stream = new ReadableStream<UIMessageChunk>({
      start: (controller) => {
        this.controller = controller;
        controller.enqueue({ type: 'start', messageId });
      },
      cancel: () => {
        this.controller = null;
      },
    });
    const result = await this.request<TurnStartResponse, 'turn/start'>('turn/start', {
      threadId: this.threadId!,
      input: [{ type: 'text', text, text_elements: [] }],
    });
    this.turnId = result.turn.id;
    accepted(this.turnId);
    return stream;
  }

  async interrupt() {
    if (!this.turnId) throw new Error('Native turn acceptance is unknown');
    await this.request('turn/interrupt', { threadId: this.threadId!, turnId: this.turnId });
    await this.withTimeout(this.terminal.promise);
  }

  get finished() {
    return this.terminal.promise;
  }

  private async request<T = unknown, M extends ClientRequest['method'] = ClientRequest['method']>(
    method: M,
    params: Extract<ClientRequest, { method: M }>['params'],
  ): Promise<T> {
    const id = ++this.nextId;
    const response = Promise.withResolvers<unknown>();
    this.pending.set(id, response);
    try {
      await this.sandbox.command(JSON.stringify({ id, method, params }));
      return (await this.withTimeout(response.promise)) as T;
    } finally {
      this.pending.delete(id);
    }
  }

  private async withTimeout<T>(promise: Promise<T>): Promise<T> {
    const signal = AbortSignal.timeout(30_000);
    const timeout = Promise.withResolvers<never>();
    const fail = () => timeout.reject(new Error('Native command did not settle'));
    signal.addEventListener('abort', fail, { once: true });
    try {
      return await Promise.race([promise, timeout.promise]);
    } finally {
      signal.removeEventListener('abort', fail);
    }
  }

  private async read(body: ReadableStream<Uint8Array>) {
    const reader = body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = '';
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) throw new Error('Native runner disconnected');
        buffer += value;
        let newline: number;
        while ((newline = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, newline);
          buffer = buffer.slice(newline + 1);
          if (line) this.receive(JSON.parse(line));
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  private receive(
    frame:
      | ServerNotification
      | ServerRequest
      | { id: number; result?: unknown; error?: { message: string } },
  ) {
    if ('id' in frame) {
      const pending = typeof frame.id === 'number' ? this.pending.get(frame.id) : undefined;
      if ('method' in frame) {
        // Approval and other server requests are unavailable in this pilot.
        void this.sandbox
          .command(
            JSON.stringify({
              id: frame.id,
              error: { code: -32601, message: 'Unsupported server request' },
            }),
          )
          .catch((error: unknown) => this.terminal.reject(error));
      } else if (frame.error) {
        pending?.reject(new Error(frame.error.message));
      } else {
        pending?.resolve(frame.result);
      }
      return;
    }
    switch (frame.method) {
      case 'item/agentMessage/delta':
      case 'item/reasoning/summaryTextDelta': {
        const params = frame.params;
        if (params.threadId !== this.threadId || !this.controller) return;
        const type = frame.method === 'item/agentMessage/delta' ? 'text' : 'reasoning';
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
        break;
      }
      case 'turn/completed':
        if (frame.params.threadId !== this.threadId) return;
        if (frame.params.turn.status === 'failed') {
          this.terminal.reject(new Error(frame.params.turn.error?.message ?? 'Native turn failed'));
        } else if (
          frame.params.turn.status === 'completed' ||
          frame.params.turn.status === 'interrupted'
        ) {
          this.terminal.resolve(undefined);
        }
        break;
      default:
        break;
    }
  }

  closeStream(error?: unknown) {
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
