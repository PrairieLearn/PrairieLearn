import { expect, it, vi } from 'vitest';

import { CourseAgentModelOutbound } from './sandbox.js';

vi.mock('cloudflare:workers', () => ({
  DurableObject: class {},
  WorkerEntrypoint: class {
    constructor(
      readonly ctx: unknown,
      readonly env: unknown,
    ) {}
  },
}));
vi.mock('@cloudflare/sandbox', () => ({ DirectoryBackup: vi.fn(), Files: vi.fn() }));
vi.mock('../monitoring.js', () => ({ logEvent: vi.fn(), redactSecrets: (text: string) => text }));

function outbound() {
  const proxyModelRequest = vi.fn(async () => new Response('ok'));
  const entrypoint = new CourseAgentModelOutbound(
    {
      props: {
        model: 'gpt-6-luna',
        sandboxId: 'sandbox',
        conversationId: 'conversation',
        executionId: 'execution',
      },
    } as unknown as ExecutionContext,
    { Conversation: { getByName: () => ({ proxyModelRequest }) } } as unknown as Env,
  );
  const send = (body: Record<string, unknown>) =>
    entrypoint.fetch(
      new Request('http://model.internal/v1/responses', {
        method: 'POST',
        body: JSON.stringify({ model: 'gpt-6-luna', input: [], ...body }),
      }),
    );
  return { send, proxyModelRequest };
}

it('refuses request options that bill differently from the recorded usage', async () => {
  const { send, proxyModelRequest } = outbound();
  expect((await send({ background: true })).status).toBe(403);
  expect((await send({ service_tier: 'priority' })).status).toBe(403);
  expect((await send({ model: 'another-model' })).status).toBe(403);
  expect(proxyModelRequest).not.toHaveBeenCalled();
  expect((await send({ service_tier: 'default', background: false })).status).toBe(200);
  expect(proxyModelRequest).toHaveBeenCalledOnce();
});
