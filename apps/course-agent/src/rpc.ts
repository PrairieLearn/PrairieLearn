import { z } from 'zod';

type Validator<T> = (value: unknown) => value is T;
export interface RpcNotification<P> {
  method: string;
  params: Validator<P>;
}
export interface RpcMethod<P, R> extends RpcNotification<P> {
  result: Validator<R>;
}

const Id = z.union([z.string(), z.number().int()]);
const Envelope = z.union([
  z.object({
    method: z.string(),
    id: Id.optional(),
    params: z.unknown().optional(),
    result: z.never().optional(),
    error: z.never().optional(),
  }),
  z
    .object({
      id: Id,
      result: z.unknown(),
      method: z.never().optional(),
      error: z.never().optional(),
    })
    .refine((frame) => Object.hasOwn(frame, 'result')),
  z.object({
    id: Id,
    error: z.object({ code: z.number(), message: z.string(), data: z.unknown().optional() }),
    method: z.never().optional(),
    result: z.never().optional(),
  }),
]);

/** JSON-RPC over one WebSocket. Payload validation is supplied by the caller's protocol. */
export class RpcConnection {
  private nextId = 0;
  private pending = new Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();

  private notifications = new Map<string, (value: unknown) => void>();
  private handlers = new Map<string, (value: unknown) => Promise<unknown>>();
  private failure: Error | null = null;

  constructor(
    private socket: WebSocket,
    private onError: (error: Error) => void,
  ) {
    socket.addEventListener('message', (event) => {
      try {
        if (typeof event.data !== 'string') throw new Error('Expected a JSON-RPC text message');
        const raw: unknown = JSON.parse(event.data);
        this.receive(raw);
      } catch (error) {
        this.close(error instanceof Error ? error : new Error(String(error)));
      }
    });
    socket.addEventListener('close', () => this.close(new Error('Native runner disconnected')));
    socket.addEventListener('error', () => this.close(new Error('Native WebSocket failed')));
  }

  request<P, R>(method: RpcMethod<P, R>, params: NoInfer<P>, timeoutMs = 30_000): Promise<R> {
    if (this.failure) return Promise.reject(this.failure);
    if (!method.params(params)) {
      return Promise.reject(new Error(`Invalid parameters for ${method.method}`));
    }
    const id = ++this.nextId;
    return new Promise<R>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Native command did not settle: ${method.method}`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (value) => {
          if (!method.result(value)) throw new Error(`Invalid result for ${method.method}`);
          resolve(value);
        },
        reject,
        timer,
      });
      try {
        this.send({ id, method: method.method, params });
      } catch (error) {
        this.close(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  notify(method: string, params?: unknown) {
    this.send({ method, ...(params === undefined ? {} : { params }) });
  }

  onNotification<P>(notification: RpcNotification<P>, handler: (params: P) => void) {
    this.notifications.set(notification.method, (value) => {
      if (!notification.params(value)) {
        throw new Error(`Invalid notification: ${notification.method}`);
      }
      handler(value);
    });
  }

  onRequest<P, R>(method: RpcMethod<P, R>, handler: (params: P) => R | Promise<R>) {
    this.handlers.set(method.method, async (value) => {
      if (!method.params(value)) throw new Error(`Invalid request: ${method.method}`);
      const result = await handler(value);
      if (!method.result(result)) throw new Error(`Invalid result for ${method.method}`);
      return result;
    });
  }

  private send(frame: unknown) {
    if (this.failure) throw this.failure;
    this.socket.send(JSON.stringify(frame));
  }

  private receive(raw: unknown) {
    const frame = Envelope.parse(raw);
    if (frame.method !== undefined) {
      if (frame.id === undefined) {
        this.notifications.get(frame.method)?.(frame.params);
      } else {
        const id = frame.id;
        const handler = this.handlers.get(frame.method);
        if (!handler) {
          this.send({ id, error: { code: -32601, message: 'Unsupported server request' } });
          return;
        }
        void handler(frame.params)
          .then(
            (result) => this.send({ id, result }),
            () => this.send({ id, error: { code: -32603, message: 'Server request failed' } }),
          )
          .catch((error: unknown) =>
            this.close(error instanceof Error ? error : new Error(String(error))),
          );
      }
      return;
    }
    if (typeof frame.id !== 'number') return;
    const pending = this.pending.get(frame.id);
    if (!pending) return;
    if (frame.error !== undefined) pending.reject(new Error(frame.error.message));
    else pending.resolve(frame.result);
    clearTimeout(pending.timer);
    this.pending.delete(frame.id);
  }

  close(error = new Error('Native connection closed')) {
    if (this.failure) return;
    this.failure = error;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
    this.notifications.clear();
    this.handlers.clear();
    this.socket.close(1000, 'Connection finished');
    this.onError(error);
  }
}
