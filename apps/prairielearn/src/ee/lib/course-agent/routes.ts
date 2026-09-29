import { once } from 'node:events';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';

import { createUIMessageStreamResponse } from 'ai';
import { Router } from 'express';
import { z } from 'zod';

import { IdSchema, parseRequestParams } from '@prairielearn/zod';

import { extractPageContext } from '../../../lib/client/page-context.js';
import { typedAsyncHandler } from '../../../lib/res-locals.js';
import { type AgentScope, selectConversation } from '../../../models/course-agent-conversation.js';

import { subscribe } from './events.js';
import { dispatchHostTool } from './host-tools.js';
import { prepare, provider, snapshot } from './service.js';
import { recordUsage } from './usage.js';

const router = Router({ mergeParams: true });
const ParamsSchema = z.object({ conversation_id: IdSchema });
router.get(
  '/:conversation_id/events',
  typedAsyncHandler<'course'>(async (req, res) => {
    const { conversation_id } = parseRequestParams(req, ParamsSchema);
    const { course, authz_data: authz } = extractPageContext(res.locals, {
      pageType: 'course',
      accessType: 'instructor',
    });
    const scope: AgentScope = {
      course_id: course.id,
      user_id: authz.user.id,
      authn_user_id: authz.authn_user.id,
    };
    const conversation = await selectConversation(scope, conversation_id);
    const chat = await provider(scope, conversation);
    // Authorization may finish after the browser has already navigated away.
    if (res.destroyed || res.closed) return;
    const lifetime = new AbortController();
    res.once('close', () => lifetime.abort());
    const expiry = setTimeout(() => res.end(), 5 * 60_000);
    expiry.unref();
    const signal = lifetime.signal;
    let ready = false;
    let running = false;
    let dirty = true;
    const fail = () => {
      res.end();
      lifetime.abort();
    };
    const refresh = async () => {
      dirty = true;
      if (!ready || running || signal.aborted) return;
      running = true;
      try {
        // A socket callback may mark the snapshot dirty while the read is awaiting I/O.
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        while (dirty && !signal.aborted) {
          dirty = false;
          const c = await selectConversation(scope, conversation_id);
          const next = await snapshot(c, await chat.getSnapshot(signal));
          next.diagnostics = await chat.getDiagnostics(signal);
          next.usage = await recordUsage(c, next);
          if (!res.write(`data: ${JSON.stringify(next)}\n\n`)) {
            await once(res, 'drain', {
              signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
            });
          }
        }
      } catch {
        fail();
      } finally {
        running = false;
      }
    };
    const unlisten = await subscribe(conversation_id, () => void refresh());
    let unwatch: (() => void) | undefined;
    const clean = () => {
      clearTimeout(expiry);
      unlisten();
      unwatch?.();
    };
    res.once('close', clean);
    try {
      unwatch = await chat.watch(
        signal,
        () => void refresh(),
        fail,
        (call) =>
          dispatchHostTool(call, (incoming) =>
            prepare(scope, conversation, {
              id: incoming.id,
              sequence: incoming.sequence!,
              name: incoming.name,
              args: incoming.input,
            }),
          ),
      );
      if (signal.aborted) {
        clean();
        return;
      }
      res.set({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
      });
      res.flushHeaders();
      ready = true;
      await refresh();
    } catch (error) {
      clean();
      throw error;
    }
  }),
);
router.get(
  '/:conversation_id/stream',
  typedAsyncHandler<'course'>(async (req, res) => {
    const { conversation_id } = parseRequestParams(req, ParamsSchema);
    const { course, authz_data: authz } = extractPageContext(res.locals, {
      pageType: 'course',
      accessType: 'instructor',
    });
    const scope = {
      course_id: course.id,
      user_id: authz.user.id,
      authn_user_id: authz.authn_user.id,
    };
    const chat = await provider(scope, await selectConversation(scope, conversation_id));
    // Authorization may finish after the browser has already navigated away.
    if (res.destroyed || res.closed) return;
    const lifetime = new AbortController();
    res.once('close', () => lifetime.abort());
    const expiry = setTimeout(() => lifetime.abort(), 5 * 60_000);
    expiry.unref();
    let connection: Awaited<ReturnType<typeof chat.connect>> | undefined;
    try {
      connection = await chat.connect(lifetime.signal);
      const stream = await connection.resume();
      if (!stream) {
        res.status(204).end();
        return;
      }
      lifetime.signal.throwIfAborted();
      const response = createUIMessageStreamResponse({ stream });
      response.headers.forEach((value, key) => res.setHeader(key, value));
      // Node and the AI SDK use distinct TypeScript declarations for the same WHATWG stream.
      await pipeline(
        Readable.fromWeb(response.body as unknown as NodeReadableStream<Uint8Array>),
        res,
        { signal: lifetime.signal },
      );
    } catch (error) {
      if (!lifetime.signal.aborted) throw error;
      res.end();
    } finally {
      clearTimeout(expiry);
      connection?.close();
    }
  }),
);
export default router;
