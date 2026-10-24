import {
  Event,
  type MessageReader,
  type MessageWriter,
  createMessageConnection,
} from 'vscode-jsonrpc/browser';
import { z } from 'zod';

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

/** Adapt Cloudflare's accepted socket and Codex's omitted JSON-RPC version field. */
export function createCodexConnection(socket: WebSocket, onError: (error: Error) => void) {
  const fail = (error: Error) => {
    connection.dispose();
    onError(error);
  };
  const disconnected = () => fail(new Error('Native runner disconnected'));
  const failed = () => fail(new Error('Native WebSocket failed'));
  socket.addEventListener('close', disconnected);
  socket.addEventListener('error', failed);
  const reader: MessageReader = {
    onError: Event.None,
    onClose: Event.None,
    onPartialMessage: Event.None,
    listen(callback) {
      const receive = (event: MessageEvent) => {
        try {
          if (typeof event.data !== 'string') throw new Error('Expected a JSON-RPC text message');
          const raw: unknown = JSON.parse(event.data);
          callback({ ...Envelope.parse(raw), jsonrpc: '2.0' });
        } catch (error) {
          fail(error instanceof Error ? error : new Error(String(error)));
        }
      };
      socket.addEventListener('message', receive);
      const stop = () => socket.removeEventListener('message', receive);
      connection.onDispose(stop);
      return { dispose: stop };
    },
    dispose() {},
  };
  const writer: MessageWriter = {
    onError: Event.None,
    onClose: Event.None,
    async write(message) {
      // Codex omits the version field in both directions.
      const { jsonrpc: _version, ...frame } = message;
      try {
        socket.send(JSON.stringify(frame));
      } catch (error) {
        fail(error instanceof Error ? error : new Error(String(error)));
        throw error;
      }
    },
    end() {
      socket.close(1000, 'Connection finished');
    },
    dispose() {},
  };
  const connection = createMessageConnection(reader, writer);
  connection.onDispose(() => {
    socket.removeEventListener('close', disconnected);
    socket.removeEventListener('error', failed);
    socket.close(1000, 'Connection finished');
  });
  return connection;
}
