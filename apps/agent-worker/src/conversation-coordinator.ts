import { DurableObject } from 'cloudflare:workers';

import { type ConversationRunState, parseRunId } from './conversation.js';

const stateKey = 'run-state';

export class ConversationCoordinator extends DurableObject<Cloudflare.Env> {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/state') {
      const state = await this.ctx.storage.get<ConversationRunState>(stateKey);
      return Response.json(state ?? { status: 'idle' });
    }

    if (request.method === 'POST' && url.pathname === '/begin') {
      const body = await parseBody(request);
      const runId = parseRunId(body.run_id);
      const state = await this.ctx.storage.transaction(async (transaction) => {
        const currentState = await transaction.get<ConversationRunState>(stateKey);
        if (currentState?.status === 'running') return null;

        const nextState: ConversationRunState = {
          status: 'running',
          runId,
          updatedAt: new Date().toISOString(),
        };
        await transaction.put(stateKey, nextState);
        return nextState;
      });

      if (!state) {
        return Response.json({ error: 'Conversation already has a running turn' }, { status: 409 });
      }

      return Response.json(state);
    }

    if (request.method === 'POST' && url.pathname === '/complete') {
      const body = await parseBody(request);
      const runId = parseRunId(body.run_id);
      const checkpointKey = body.checkpoint_key;

      if (typeof checkpointKey !== 'string') {
        return Response.json({ error: 'checkpoint_key must be a string' }, { status: 400 });
      }

      const state = await this.transitionRunningRun(runId, {
        status: 'complete',
        runId,
        updatedAt: new Date().toISOString(),
        checkpointKey,
      });
      if (!state) {
        return Response.json({ error: 'Run is not active for this conversation' }, { status: 409 });
      }

      return Response.json(state);
    }

    if (request.method === 'POST' && url.pathname === '/fail') {
      const body = await parseBody(request);
      const runId = parseRunId(body.run_id);
      const error = body.error;

      if (typeof error !== 'string') {
        return Response.json({ error: 'error must be a string' }, { status: 400 });
      }

      const state = await this.transitionRunningRun(runId, {
        status: 'failed',
        runId,
        updatedAt: new Date().toISOString(),
        error,
      });
      if (!state) {
        return Response.json({ error: 'Run is not active for this conversation' }, { status: 409 });
      }

      return Response.json(state);
    }

    return new Response('Not found', { status: 404 });
  }

  private async transitionRunningRun(
    runId: string,
    nextState: ConversationRunState,
  ): Promise<ConversationRunState | null> {
    return this.ctx.storage.transaction(async (transaction) => {
      const state = await transaction.get<ConversationRunState>(stateKey);
      if (state?.status !== 'running' || state.runId !== runId) return null;

      await transaction.put(stateKey, nextState);
      return nextState;
    });
  }
}

async function parseBody(request: Request): Promise<Record<string, unknown>> {
  const body: unknown = await request.json();

  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new Error('Request body must be an object');
  }

  return body as Record<string, unknown>;
}
