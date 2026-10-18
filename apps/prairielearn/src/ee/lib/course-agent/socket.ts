import { randomUUID } from 'node:crypto';

import WebSocket from 'ws';

import {
  type Command,
  CommandSchema,
  type ConversationEvent,
  ServerFrameSchema,
} from '@prairielearn/course-agent-protocol';
import { withResolvers } from '@prairielearn/utils';

import { buildServiceRequest } from './client.js';

export class CourseAgentCommandError extends Error {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(message);
  }
}

interface Result {
  turnId?: string;
  messageId?: string;
}

/** A service socket belongs to one command or one browser observation, never to execution. */
export async function connectCourseAgent({
  conversationId,
  onEvent = () => {},
  onClose = () => {},
  signal,
}: {
  conversationId: string;
  onEvent?: (event: ConversationEvent) => void;
  onClose?: () => void;
  signal?: AbortSignal;
}) {
  const { url, headers } = buildServiceRequest(
    `conversations/${encodeURIComponent(conversationId)}/socket`,
  );
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  const socket = new WebSocket(url, {
    headers,
    handshakeTimeout: 10_000,
    maxPayload: 8 * 1024 * 1024,
  });
  const ready = withResolvers<undefined>();
  const pending = new Map<
    string,
    {
      resolve: (result: Result) => void;
      reject: (error: Error) => void;
      timer: NodeJS.Timeout;
    }
  >();
  const close = () => {
    if (socket.readyState === WebSocket.OPEN) socket.close();
    else if (socket.readyState === WebSocket.CONNECTING) socket.terminate();
  };
  const abort = () => close();
  signal?.addEventListener('abort', abort, { once: true });
  socket.on('open', () => ready.resolve(undefined));
  socket.on('error', () => {
    ready.reject(new Error('The course agent is unavailable.'));
    close();
  });
  socket.on('close', () => {
    signal?.removeEventListener('abort', abort);
    const error = new Error('The course agent connection closed.');
    ready.reject(error);
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(error);
    }
    pending.clear();
    onClose();
  });
  socket.on('message', (data) => {
    let json: unknown;
    try {
      json = JSON.parse(data.toString());
    } catch {
      close();
      return;
    }
    const parsed = ServerFrameSchema.safeParse(json);
    if (!parsed.success) {
      close();
      return;
    }
    const frame = parsed.data;
    if (frame.type === 'event') {
      onEvent(frame);
      return;
    }
    const request = pending.get(frame.ref);
    if (!request) return;
    clearTimeout(request.timer);
    pending.delete(frame.ref);
    if (frame.type === 'error') {
      request.reject(new CourseAgentCommandError(frame.code, frame.message));
    } else {
      request.resolve(frame.result);
    }
  });
  if (signal?.aborted) close();
  await ready.promise;
  return {
    close,
    command<M extends Command['method']>(
      method: M,
      params: Extract<Command, { method: M }>['params'],
    ): Promise<Result> {
      if (socket.readyState !== WebSocket.OPEN) {
        return Promise.reject(new Error('The course agent connection closed.'));
      }
      const ref = randomUUID();
      const frame = CommandSchema.parse({ type: 'command', ref, method, params });
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(ref);
          // The command may have been accepted. The browser must reconcile a
          // fresh snapshot instead of sending it again after an uncertain result.
          reject(new Error('The agent acknowledgement was lost. Reconnect to check its status.'));
          close();
        }, 10_000);
        pending.set(ref, { resolve, reject, timer });
        socket.send(JSON.stringify(frame));
      });
    },
  };
}
