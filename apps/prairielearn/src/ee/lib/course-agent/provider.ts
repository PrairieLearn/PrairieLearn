import { once } from 'node:events';

import { WebSocketChatTransport } from 'agents/chat/transport';
import { validateUIMessages } from 'ai';
import WebSocket from 'ws';
import { z } from 'zod';

import {
  type ChatConnection,
  ChatError,
  type ChatProvider,
  type ChatSnapshot,
  sandboxDiagnosticsSchema,
} from '@prairielearn/course-agent-contract';
import * as Sentry from '@prairielearn/sentry';

import { config } from '../../../lib/config.js';

import { workerResponseError } from './errors.js';
import { executeHostTool } from './host-tools.js';

const CONNECTION_TIMEOUT_MS = 10_000;
const REQUEST_TIMEOUT_MS = 30_000;
const resumeEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('cf_agent_stream_resuming'), id: z.string() }),
  z.object({
    type: z.literal('cf_agent_stream_resume_none'),
    probeId: z.string().optional(),
  }),
  z.object({ type: z.literal('cf_agent_stream_pending') }),
]);

/** Isolate Cloudflare transport behind the provider contract; the browser only sees HTTP and AI SDK SSE. */
export function createCloudflareProvider(workerUrl: URL, id: string): ChatProvider {
  const agentUrl = new URL(`/agents/chat/${encodeURIComponent(id)}`, workerUrl);

  async function request(
    path: string,
    method: string,
    signal: AbortSignal,
    body?: unknown,
    timeoutMs: number | null = REQUEST_TIMEOUT_MS,
  ) {
    const response = await fetch(`${agentUrl}/${path}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(config.courseAgent?.serviceToken
          ? { Authorization: `Bearer ${config.courseAgent.serviceToken}` }
          : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal:
        timeoutMs === null ? signal : AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]),
    }).catch(() => {
      throw new ChatError(
        502,
        'Course agent connection failed. Its execution state remains unconfirmed.',
      );
    });
    if (!response.ok) {
      throw workerResponseError(response.status);
    }
    return response;
  }

  return {
    async watch(signal, changed, failed, execute = executeHostTool) {
      const url = new URL(agentUrl);
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      const socket = new WebSocket(url, {
        maxPayload: 8 * 1024 * 1024,
        headers: {
          'X-Host-Tools': '1',
          ...(config.courseAgent?.serviceToken
            ? { Authorization: `Bearer ${config.courseAgent.serviceToken}` }
            : {}),
        },
      });
      const close = () => {
        socket.close();
      };
      signal.addEventListener('abort', close, { once: true });
      socket.on('message', (data) => {
        let message;
        try {
          message = JSON.parse(String(data));
        } catch {
          close();
          failed();
          return;
        }
        if (message.type === 'host-tool-call') {
          void execute(message)
            .then((result) => {
              if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(result));
            })
            .catch((error: unknown) => {
              Sentry.captureException(error);
              close();
              failed();
            });
          return;
        }
        // SDK broadcasts durable state and message updates; tokens continue over the separate AI SDK stream.
        if (['cf_agent_state', 'cf_agent_chat_messages'].includes(message.type)) changed();
      });
      socket.on('close', failed);
      socket.on('error', failed);
      try {
        await once(socket, 'open', {
          signal: AbortSignal.any([signal, AbortSignal.timeout(CONNECTION_TIMEOUT_MS)]),
        });
      } catch (error) {
        signal.removeEventListener('abort', close);
        close();
        throw error;
      }
      socket.send(JSON.stringify({ type: 'host-tools-ready' }));
      return () => {
        signal.removeEventListener('abort', close);
        socket.removeListener('close', failed);
        socket.removeListener('error', failed);
        close();
      };
    },
    async getSnapshot(signal, operationIds) {
      const path = operationIds
        ? `snapshot?ids=${encodeURIComponent(JSON.stringify(operationIds))}`
        : 'snapshot';
      const response = await request(path, 'GET', signal);
      const value = (await response.json()) as ChatSnapshot;
      const messages =
        value.messages.length > 0 ? await validateUIMessages({ messages: value.messages }) : [];
      return {
        messages,
        executions: value.executions,
        operationNumber: z.number().int().nonnegative().parse(value.operationNumber),
      };
    },
    async getDiagnostics(signal) {
      const response = await request('diagnostics', 'GET', signal);
      return sandboxDiagnosticsSchema.parse(await response.json());
    },
    async retryCleanup(signal) {
      await request('cleanup', 'POST', signal);
    },
    async getHistory(signal) {
      const response = await request('get-messages', 'GET', signal);
      const messages: unknown = await response.json();
      // An empty history is valid, although the SDK validates nonempty chat requests.
      if (Array.isArray(messages) && messages.length === 0) return [];
      return validateUIMessages({ messages });
    },
    async send(input, signal) {
      // Prompt acceptance may restore a checkpoint before Codex acknowledges it.
      // The caller supplies a deadline that covers that complete operation.
      await request('message', 'POST', signal, input, null);
    },
    async reconcileAdmissions(admissions, signal) {
      const response = await request('reconcile-admissions', 'POST', signal, { admissions });
      return z.object({ rejected: z.array(z.uuid()) }).parse(await response.json());
    },
    async cancel(signal) {
      await request('cancel', 'POST', signal);
    },
    connect(signal) {
      return connectToAgent(agentUrl, signal, id);
    },
  };
}

async function connectToAgent(
  agentUrl: URL,
  clientSignal: AbortSignal,
  chatId: string,
): Promise<ChatConnection> {
  clientSignal.throwIfAborted();
  const socketUrl = new URL(agentUrl);
  socketUrl.protocol = socketUrl.protocol === 'https:' ? 'wss:' : 'ws:';

  const socket = new WebSocket(socketUrl, {
    maxPayload: 8 * 1024 * 1024,
    headers: config.courseAgent?.serviceToken
      ? { Authorization: `Bearer ${config.courseAgent.serviceToken}` }
      : {},
  });
  const lifetime = new AbortController();
  const listeners = new AbortController();
  const events = new EventTarget();
  let receivedBytes = 0;
  socket.on('message', (data) => {
    receivedBytes += Buffer.byteLength(String(data));
    if (receivedBytes > 8 * 1024 * 1024) {
      lifetime.abort(new Error('Stream size limit reached. Reconnect to read saved history.'));
      socket.close();
      return;
    }
    events.dispatchEvent(new MessageEvent('message', { data: String(data) }));
  });
  const transport = new WebSocketChatTransport({
    agent: {
      send: (data) => socket.send(data),
      addEventListener: (type, listener, options) =>
        events.addEventListener(type, listener as EventListener, options),
      removeEventListener: (type, listener) =>
        events.removeEventListener(type, listener as EventListener),
    },
    cancelOnClientAbort: false,
  });
  let closed = false;

  function close() {
    if (closed) return;
    closed = true;
    transport.resetResumeState();
    lifetime.abort();
    listeners.abort();
    socket.close();
  }

  function handleDisconnect() {
    lifetime.abort(new Error('Cloudflare connection closed.'));
    transport.cancelPendingResume();
  }

  function handleMessage(event: MessageEvent) {
    // The SDK reads chat chunks directly. Only resume control events need forwarding.
    try {
      const parsed = resumeEventSchema.safeParse(JSON.parse(String(event.data)));
      if (!parsed.success) return;
      const message = parsed.data;
      switch (message.type) {
        case 'cf_agent_stream_resuming':
          transport.handleStreamResuming(message);
          break;
        case 'cf_agent_stream_resume_none':
          transport.handleStreamResumeNone(message);
          break;
        case 'cf_agent_stream_pending':
          transport.handleStreamPending();
          break;
      }
    } catch (error) {
      lifetime.abort(new Error('Invalid Cloudflare protocol message.', { cause: error }));
      transport.cancelPendingResume();
    }
  }

  const listenerOptions = { signal: listeners.signal };
  clientSignal.addEventListener('abort', close, listenerOptions);
  socket.on('close', handleDisconnect);
  socket.on('error', handleDisconnect);
  events.addEventListener(
    'message',
    (event) => handleMessage(event as MessageEvent),
    listenerOptions,
  );

  try {
    await once(socket, 'open', {
      signal: AbortSignal.any([lifetime.signal, AbortSignal.timeout(CONNECTION_TIMEOUT_MS)]),
    });
  } catch (error) {
    close();
    throw new Error('Could not connect to Cloudflare.', { cause: error });
  }

  return {
    close,
    async resume() {
      const stream = await transport.reconnectToStream({
        chatId,
      });
      lifetime.signal.throwIfAborted();
      return (
        stream?.pipeThrough(new TransformStream(), {
          signal: lifetime.signal,
        }) ?? null
      );
    },
  };
}
