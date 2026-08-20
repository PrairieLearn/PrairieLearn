import { getSandbox } from '@cloudflare/sandbox';

import {
  PublishAgentRunRequestSchema,
  StartAgentRunRequestSchema,
} from '@prairielearn/agent-protocol';

import { AgentSandbox, ContainerProxy } from './agent-sandbox.js';
import {
  assertConversationCapability,
  assertLocalControlCapability,
  assertRunCapability,
  assertStartCapability,
  parsePublicationCapability,
  verifyCapability,
} from './auth.js';
import { ConversationCoordinator } from './conversation-coordinator.js';

export { AgentSandbox, ContainerProxy, ConversationCoordinator };

type AgentWorkerEnv = Cloudflare.Env & {
  AGENT_CAPABILITY_SECRET?: string;
  AGENT_STATE: R2Bucket;
  AGENT_WORKER_ENABLED?: string;
  LOCAL_DEVELOPMENT?: string;
  PRAIRIELEARN_ORIGIN?: string;
  SANDBOX: DurableObjectNamespace<AgentSandbox>;
};

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/health') {
      return Response.json({ status: 'ok', enabled: isEnabled(env) });
    }
    if (!isEnabled(env)) return new Response('Not found', { status: 404 });

    try {
      if (!env.AGENT_CAPABILITY_SECRET) {
        throw new Error('Agent capability verification is not configured');
      }
      const capability = await verifyCapability(request, env.AGENT_CAPABILITY_SECRET);

      if (request.method === 'POST' && url.pathname === '/v1/runs/start') {
        const body = StartAgentRunRequestSchema.parse(await request.json());
        await assertStartCapability(capability, body);
        assertPrairieLearnOrigin(env, body.prairielearn_base_url);
        const coordinator = env.CONVERSATIONS.getByName(body.conversation_id);
        return await coordinator.fetch(
          new Request('http://conversation/start', {
            method: 'POST',
            body: JSON.stringify({
              request: body,
              capability: capability.token,
              allowed_tools: capability.claims.allowed_tools,
            }),
          }),
        );
      }

      const runMatch = /^\/v1\/runs\/([^/]+)$/.exec(url.pathname);
      if (request.method === 'GET' && runMatch) {
        const runId = decodeURIComponent(runMatch[1]);
        assertRunCapability(capability, runId);
        const coordinator = env.CONVERSATIONS.getByName(capability.claims.conversation_id);
        return await coordinator.fetch(
          new Request(`http://conversation/state?run_id=${encodeURIComponent(runId)}`),
        );
      }

      const cancelMatch = /^\/v1\/runs\/([^/]+)\/cancel$/.exec(url.pathname);
      if (request.method === 'POST' && cancelMatch) {
        const runId = decodeURIComponent(cancelMatch[1]);
        assertRunCapability(capability, runId);
        const coordinator = env.CONVERSATIONS.getByName(capability.claims.conversation_id);
        return await coordinator.fetch(
          new Request('http://conversation/cancel', {
            method: 'POST',
            body: JSON.stringify({ run_id: runId }),
          }),
        );
      }

      const publishMatch = /^\/v1\/runs\/([^/]+)\/publish$/.exec(url.pathname);
      if (request.method === 'POST' && publishMatch) {
        const runId = decodeURIComponent(publishMatch[1]);
        const body = PublishAgentRunRequestSchema.parse(await request.json());
        const publication = parsePublicationCapability(capability.payload);
        if (
          capability.claims.run_id !== runId ||
          publication.operation_id !== body.operation_id ||
          JSON.stringify(publication.target) !== JSON.stringify(body.target)
        ) {
          throw new Error('Publication capability does not match request');
        }
        const coordinator = env.CONVERSATIONS.getByName(capability.claims.conversation_id);
        return await coordinator.fetch(
          new Request(`http://conversation/publish?run_id=${encodeURIComponent(runId)}`, {
            method: 'POST',
            body: JSON.stringify({ request: body, jti: capability.claims.jti }),
          }),
        );
      }

      const conversationMatch = /^\/v1\/conversations\/([^/]+)$/.exec(url.pathname);
      if (request.method === 'DELETE' && conversationMatch) {
        const conversationId = decodeURIComponent(conversationMatch[1]);
        assertConversationCapability(capability, conversationId);
        const coordinator = env.CONVERSATIONS.getByName(conversationId);
        return await coordinator.fetch(
          new Request('http://conversation/conversation', { method: 'DELETE' }),
        );
      }

      const localDestroyMatch = /^\/internal\/local\/conversations\/([^/]+)\/destroy-sandbox$/.exec(
        url.pathname,
      );
      if (request.method === 'POST' && localDestroyMatch && env.LOCAL_DEVELOPMENT === 'true') {
        const conversationId = decodeURIComponent(localDestroyMatch[1]);
        assertLocalControlCapability(capability, conversationId);
        await getSandbox<AgentSandbox>(env.SANDBOX, conversationId).destroy();
        return new Response(null, { status: 204 });
      }

      const localCheckpointMatch = /^\/internal\/local\/runs\/([^/]+)\/checkpoint$/.exec(
        url.pathname,
      );
      if (request.method === 'GET' && localCheckpointMatch && env.LOCAL_DEVELOPMENT === 'true') {
        const runId = decodeURIComponent(localCheckpointMatch[1]);
        assertRunCapability(capability, runId);
        const coordinator = env.CONVERSATIONS.getByName(capability.claims.conversation_id);
        return await coordinator.fetch(
          new Request(`http://conversation/checkpoint?run_id=${encodeURIComponent(runId)}`),
        );
      }

      const localObjectCountMatch =
        /^\/internal\/local\/conversations\/([^/]+)\/object-count$/.exec(url.pathname);
      if (request.method === 'GET' && localObjectCountMatch && env.LOCAL_DEVELOPMENT === 'true') {
        const conversationId = decodeURIComponent(localObjectCountMatch[1]);
        assertConversationCapability(capability, conversationId);
        let cursor: string | undefined;
        let count = 0;
        do {
          const result = await env.AGENT_STATE.list({
            prefix: `conversations/${conversationId}/`,
            cursor,
          });
          count += result.objects.length;
          cursor = result.truncated ? result.cursor : undefined;
        } while (cursor !== undefined);
        return Response.json({ count });
      }

      return new Response('Not found', { status: 404 });
    } catch (error) {
      return Response.json({ error: errorMessage(error) }, { status: authenticationStatus(error) });
    }
  },
} satisfies ExportedHandler<AgentWorkerEnv>;

function isEnabled(env: AgentWorkerEnv): boolean {
  return env.AGENT_WORKER_ENABLED === 'true' && Boolean(env.AGENT_CAPABILITY_SECRET);
}

function assertPrairieLearnOrigin(env: AgentWorkerEnv, baseUrl: string): void {
  const url = new URL(baseUrl);
  if (env.LOCAL_DEVELOPMENT === 'true') {
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('Invalid local PrairieLearn callback scheme');
    }
    return;
  }
  if (url.protocol !== 'https:') throw new Error('PrairieLearn callback URL must use HTTPS');
  if (!env.PRAIRIELEARN_ORIGIN) throw new Error('PrairieLearn callback origin is not configured');
  if (url.origin !== new URL(env.PRAIRIELEARN_ORIGIN).origin) {
    throw new Error('PrairieLearn callback origin is not authorized');
  }
}

function authenticationStatus(error: unknown): number {
  if (
    error instanceof Error &&
    (error.message.includes('capability') ||
      error.message.includes('signature') ||
      error.message.includes('JWT') ||
      error.message.includes('token'))
  ) {
    return 401;
  }
  return 400;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}
