import { getSandbox } from '@cloudflare/sandbox';

import { AgentSandbox, ContainerProxy } from './agent-sandbox.js';
import {
  type LocalSmokeCheckpoint,
  localSmokeCheckpointKey,
  parseCheckpoint,
  serializeCheckpoint,
} from './checkpoint.js';
import { ConversationCoordinator } from './conversation-coordinator.js';
import { parseConversationId } from './conversation.js';

export { AgentSandbox, ContainerProxy, ConversationCoordinator };

type AgentWorkerEnv = Cloudflare.Env & {
  LOCAL_DEVELOPMENT?: string;
  SANDBOX: DurableObjectNamespace<AgentSandbox>;
};

const localSmokeCommand = [
  '/bin/bash',
  '-lc',
  "node --version && git --version && node -e \"import('/opt/prairielearn-agent/node_modules/@anthropic-ai/claude-agent-sdk/sdk.mjs').then(() => console.log('claude-agent-sdk-ok'))\" && printf 'sandbox-ok\\n'",
] as const;

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/health') {
      return Response.json({ status: 'ok' });
    }

    if (request.method === 'POST' && url.pathname === '/internal/local/smoke') {
      if (env.LOCAL_DEVELOPMENT !== 'true') {
        return new Response('Not found', { status: 404 });
      }

      return runLocalSmoke(request, env);
    }

    return new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<AgentWorkerEnv>;

async function runLocalSmoke(request: Request, env: AgentWorkerEnv): Promise<Response> {
  let conversationId: string;

  try {
    const body: unknown = await request.json();
    conversationId = parseConversationId(
      typeof body === 'object' && body !== null && 'conversation_id' in body
        ? body.conversation_id
        : undefined,
    );
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 400 });
  }

  const runId = crypto.randomUUID();
  const coordinator = env.CONVERSATIONS.getByName(conversationId);
  const beginResponse = await coordinator.fetch(
    new Request('http://conversation/begin', {
      method: 'POST',
      body: JSON.stringify({ run_id: runId }),
    }),
  );

  if (!beginResponse.ok) return beginResponse;

  try {
    const sandbox = getSandbox<AgentSandbox>(env.SANDBOX, conversationId);
    const process = await sandbox.exec(localSmokeCommand, { timeout: 120_000 });
    const output = await process.output({ encoding: 'utf8', timeout: 120_000 });

    if (output.exitCode !== 0) {
      throw new Error(`Sandbox smoke command exited with ${output.exitCode}: ${output.stderr}`);
    }

    const checkpointKey = localSmokeCheckpointKey(conversationId, runId);
    const checkpoint: LocalSmokeCheckpoint = {
      version: 1,
      conversationId,
      runId,
      command: localSmokeCommand,
      stdout: output.stdout,
      stderr: output.stderr,
      exitCode: output.exitCode,
      createdAt: new Date().toISOString(),
    };
    await env.AGENT_STATE.put(checkpointKey, serializeCheckpoint(checkpoint), {
      httpMetadata: { contentType: 'application/json' },
    });

    const storedCheckpoint = await env.AGENT_STATE.get(checkpointKey);
    if (!storedCheckpoint) throw new Error('R2 checkpoint was not readable after write');

    const restoredCheckpoint = parseCheckpoint(await storedCheckpoint.text());
    const completeResponse = await coordinator.fetch(
      new Request('http://conversation/complete', {
        method: 'POST',
        body: JSON.stringify({ run_id: runId, checkpoint_key: checkpointKey }),
      }),
    );
    if (!completeResponse.ok) throw new Error(await completeResponse.text());

    return Response.json({
      status: 'ok',
      conversation_id: conversationId,
      run_id: runId,
      checkpoint_key: checkpointKey,
      sandbox: {
        stdout: restoredCheckpoint.stdout,
        stderr: restoredCheckpoint.stderr,
        exit_code: restoredCheckpoint.exitCode,
      },
    });
  } catch (error) {
    await coordinator.fetch(
      new Request('http://conversation/fail', {
        method: 'POST',
        body: JSON.stringify({ run_id: runId, error: errorMessage(error) }),
      }),
    );
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}
