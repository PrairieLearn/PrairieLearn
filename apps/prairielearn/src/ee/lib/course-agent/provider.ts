import { parseJsonEventStream, uiMessageChunkSchema, validateUIMessages } from 'ai';
import { z } from 'zod';

import {
  ChatError,
  type ChatProvider,
  type ServiceScope,
  agentSnapshotSchema,
  conversationExportSchema,
  historyPageSchema,
  runtimeSchema,
  sandboxDiagnosticsSchema,
  serviceHeaders,
} from '@prairielearn/course-agent-contract';

import { workerResponseError } from './errors.js';

/** Only versioned JSON and SSE cross the PL/agent boundary. */
export function createAgentClient(origin: URL, scope: ServiceScope, secret: string): ChatProvider {
  const resource = `/v1/conversations/${scope.conversationId}`;

  async function request(
    path: string,
    method: string,
    signal: AbortSignal,
    body?: unknown,
    streaming = false,
  ) {
    const url = new URL(resource + path, origin);
    const json = body === undefined ? '' : JSON.stringify(body);
    const response = await fetch(url, {
      method,
      headers: await serviceHeaders(secret, 'agent-api', method, url.pathname + url.search, scope, {
        body: json,
      }),
      body: json || undefined,
      redirect: 'error',
      signal: streaming ? signal : AbortSignal.any([signal, AbortSignal.timeout(120_000)]),
    }).catch(() => {
      throw new ChatError(
        502,
        'Course agent connection failed. Execution remains unconfirmed. Check saved history before retrying.',
      );
    });
    if (!response.ok) {
      const error = z
        .object({ error: z.string().optional(), message: z.string().optional() })
        .safeParse(await response.json().catch(() => null));
      if (error.success && (error.data.message || error.data.error)) {
        throw new ChatError(response.status, error.data.message ?? error.data.error!);
      }
      throw workerResponseError(response.status);
    }
    return response;
  }
  return {
    async getRuntime(signal) {
      return runtimeSchema.parse(await (await request('/runtime', 'GET', signal)).json());
    },
    async exportConversation(signal) {
      return conversationExportSchema.parse(await (await request('/export', 'GET', signal)).json());
    },
    async configure(binding, signal) {
      try {
        return z
          .object({ model: z.string().min(1) })
          .parse(await (await request('', 'PUT', signal, binding)).json());
      } catch (error) {
        if (error instanceof ChatError) throw error;
        throw new ChatError(
          502,
          'The course agent Worker returned an invalid configuration response. Your message was not sent. Check the Worker, then retry the send.',
        );
      }
    },
    async watch(signal, changed, failed) {
      const lifetime = new AbortController();
      const response = await request(
        '/events',
        'GET',
        AbortSignal.any([signal, lifetime.signal]),
        undefined,
        true,
      );
      if (!response.body) throw new ChatError(502, 'Agent events are unavailable.');
      const events = parseJsonEventStream({
        stream: response.body,
        schema: z.object({ type: z.literal('changed') }),
      });
      void (async () => {
        for await (const event of events) {
          if (!event.success) throw event.error;
          changed();
        }
        if (!signal.aborted && !lifetime.signal.aborted) failed();
      })().catch(() => {
        if (!signal.aborted && !lifetime.signal.aborted) failed();
      });
      return () => lifetime.abort();
    },
    async getSnapshot(signal, operationIds) {
      const suffix = operationIds ? `?ids=${encodeURIComponent(JSON.stringify(operationIds))}` : '';
      const value = agentSnapshotSchema.parse(
        await (await request('/snapshot' + suffix, 'GET', signal)).json(),
      );
      const messages =
        value.messages.length > 0 ? await validateUIMessages({ messages: value.messages }) : [];
      return { ...value, messages };
    },
    async getDiagnostics(signal) {
      return sandboxDiagnosticsSchema.parse(
        await (await request('/diagnostics', 'GET', signal)).json(),
      );
    },
    async retryCleanup(signal) {
      await request('/cleanup', 'POST', signal);
    },
    async requestRetention(signal) {
      await request('/retention', 'POST', signal);
    },
    async getHistory(signal) {
      const messages: unknown[] = [];
      const cursors = new Set<string>();
      let cursor: string | null = null;
      do {
        const suffix: string = cursor === null ? '' : '?cursor=' + encodeURIComponent(cursor);
        const page = historyPageSchema.parse(
          await (await request('/history' + suffix, 'GET', signal)).json(),
        );
        messages.push(...page.messages);
        cursor = page.nextCursor;
        if (cursor !== null && (cursors.has(cursor) || cursors.size >= 1000)) {
          throw new ChatError(
            502,
            'Conversation history could not be loaded. Export or reload the conversation.',
          );
        }
        if (cursor !== null) cursors.add(cursor);
      } while (cursor !== null);
      return messages.length === 0 ? [] : validateUIMessages({ messages });
    },
    async send(input, signal) {
      return z
        .object({ revision: z.number().int().nonnegative() })
        .parse(await (await request('/messages', 'POST', signal, input)).json());
    },
    async cancel(signal) {
      await request('/stop', 'POST', signal);
    },
    async connect(signal) {
      const lifetime = new AbortController();
      return {
        close: () => lifetime.abort(),
        async resume() {
          const response = await request(
            '/stream',
            'GET',
            AbortSignal.any([signal, lifetime.signal]),
            undefined,
            true,
          );
          if (response.status === 204) return null;
          if (!response.body) throw new ChatError(502, 'Agent stream is unavailable.');
          return parseJsonEventStream({
            stream: response.body,
            schema: uiMessageChunkSchema,
          }).pipeThrough(
            new TransformStream({
              transform(chunk, controller) {
                if (!chunk.success) throw chunk.error;
                controller.enqueue(chunk.value);
              },
            }),
          );
        },
      };
    },
  };
}
