import { z } from 'zod';

import { OperationTimeout } from './cleanup-error.js';
import type {
  ClientRequest,
  DynamicToolCallParams,
  DynamicToolCallResponse,
  InitializeResponse,
  ServerNotification,
  ThreadReadResponse,
  ThreadResumeResponse,
  ThreadStartResponse,
  TurnInterruptResponse,
  TurnStartResponse,
  TurnSteerResponse,
} from './protocol.js';

interface Results {
  initialize: InitializeResponse;
  'thread/start': ThreadStartResponse;
  'thread/resume': ThreadResumeResponse;
  'thread/read': ThreadReadResponse;
  'turn/start': TurnStartResponse;
  'turn/steer': TurnSteerResponse;
  'turn/interrupt': TurnInterruptResponse;
}
const envelope = z.object({
  id: z.union([z.number(), z.string()]).optional(),
  method: z.string().optional(),
  params: z.unknown().optional(),
  result: z.unknown().optional(),
  error: z.object({ code: z.number(), message: z.string() }).optional(),
});
// A rejected RPC is distinct from an uncertain transport failure.
export class AppServerError extends Error {
  readonly code: number;
  constructor(code: number, message: string) {
    super(message);
    this.code = code;
  }
}

export interface Socket {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
  addEventListener(type: 'close' | 'error', listener: () => void): void;
}

export function within<T>(promise: Promise<T>, milliseconds: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new OperationTimeout(message)), milliseconds);
    }),
  ]).finally(() => clearTimeout(timer));
}

// Cloudflare supplies the socket. This client owns only Codex's JSON-RPC protocol.
export class AppServer {
  private socket: Socket;
  private nextId = 0;
  private pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();

  private subscribers = new Set<(event: ServerNotification) => void>();
  private closed = false;
  toolHandler?: (params: DynamicToolCallParams) => Promise<DynamicToolCallResponse>;
  readonly disconnected: Promise<never>;
  private rejectDisconnected!: (error: Error) => void;

  constructor(socket: Socket) {
    this.socket = socket;
    this.disconnected = new Promise((_, reject) => {
      this.rejectDisconnected = reject;
    });
    void this.disconnected.catch(() => {});
    socket.addEventListener('message', (event) => {
      try {
        const frame = envelope.parse(JSON.parse(String(event.data)));
        if (frame.method) {
          if (frame.id !== undefined) {
            const id = frame.id;
            if (frame.method === 'item/tool/call' && this.toolHandler) {
              void this.toolHandler(frame.params as DynamicToolCallParams)
                .catch(() => ({
                  success: false,
                  contentItems: [
                    {
                      type: 'inputText' as const,
                      text: 'Host tool execution failed.',
                    },
                  ],
                }))
                .then((result) => {
                  if (!this.closed) socket.send(JSON.stringify({ id, result }));
                })
                .catch(() => this.fail(new Error('Could not deliver host tool result.')));
            } else {
              socket.send(
                JSON.stringify({
                  id,
                  error: {
                    code: -32601,
                    message: 'Client interaction is not supported',
                  },
                }),
              );
            }
          } else if (
            [
              'thread/tokenUsage/updated',
              'turn/started',
              'turn/completed',
              'item/started',
              'item/completed',
              'item/agentMessage/delta',
              'item/reasoning/summaryTextDelta',
            ].includes(frame.method)
          ) {
            // Authenticated, version-pinned protocol; generated types describe the payload.
            const notification = frame as ServerNotification;
            for (const subscriber of this.subscribers) subscriber(notification);
          }
        } else if (typeof frame.id === 'number') {
          const pending = this.pending.get(frame.id);
          if (!pending) return;
          this.pending.delete(frame.id);
          if (frame.error) {
            pending.reject(new AppServerError(frame.error.code, frame.error.message));
          } else {
            pending.resolve(frame.result);
          }
        }
      } catch {
        this.fail(new Error('Invalid Codex app-server message.'));
      }
    });
    socket.addEventListener('close', () =>
      this.fail(new Error('Codex connection closed; execution must be reconciled.')),
    );
    socket.addEventListener('error', () =>
      this.fail(new Error('Codex connection failed; execution must be reconciled.')),
    );
  }

  private fail(error: Error) {
    if (this.closed) return;
    this.closed = true;
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
    this.rejectDisconnected(error);
    this.socket.close(1000, 'Client disconnected');
  }

  close() {
    this.fail(new Error('Codex client closed.'));
  }

  async request<M extends keyof Results>(
    method: M,
    params: Extract<ClientRequest, { method: M }>['params'],
  ): Promise<Results[M]> {
    if (this.closed) throw new Error('Codex connection is closed.');
    const id = ++this.nextId;
    const response = new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      try {
        this.socket.send(JSON.stringify({ id, method, params }));
      } catch {
        reject(new Error('Could not send Codex request.'));
      }
    });
    try {
      // A timeout means an uncertain outcome: never retry a mutating request automatically.
      return (await within(
        response,
        15_000,
        `Codex ${method} acknowledgment timed out.`,
      )) as Results[M];
    } finally {
      this.pending.delete(id);
    }
  }

  async initialize() {
    await this.request('initialize', {
      // Dynamic host tools require this opt-in before thread/start.
      capabilities: { experimentalApi: true, requestAttestation: false },
      clientInfo: {
        name: 'pl_sandbox_prototype',
        title: 'PL sandbox prototype',
        version: '1',
      },
    });
    this.socket.send(JSON.stringify({ method: 'initialized' }));
  }

  subscribe(listener: (event: ServerNotification) => void) {
    this.subscribers.add(listener);
    return () => this.subscribers.delete(listener);
  }
}
