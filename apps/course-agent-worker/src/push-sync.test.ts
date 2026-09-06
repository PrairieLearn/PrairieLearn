import { describe, expect, it, vi } from 'vitest';

import { proxyPushSync, pushSyncParams } from './push-sync.js';

describe('pushSyncParams', () => {
  it('keeps the application sandbox ID alongside its Durable Object ID', () => {
    const namespace = { idFromName: vi.fn(() => ({ toString: () => 'container-id' })) };

    expect(pushSyncParams(namespace, 'course-agent-conversation')).toEqual({
      containerId: 'container-id',
      sandboxId: 'course-agent-conversation',
    });
  });
});

describe('proxyPushSync', () => {
  it('routes the request using the application sandbox ID', async () => {
    const fetch = vi.fn(() => Response.json({ accepted: true }));
    const coordinator = {
      idFromName: vi.fn(() => 'coordinator-id'),
      get: vi.fn(() => ({ fetch })),
    } as unknown as DurableObjectNamespace;
    const payload = { branch: 'main' };

    const response = await proxyPushSync(
      new Request('http://course-agent.internal/push-sync', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
      coordinator,
      {
        containerId: 'container-id',
        params: { containerId: 'container-id', sandboxId: 'course-agent-conversation' },
      },
    );

    expect(coordinator.idFromName).toHaveBeenCalledWith('course-agent-conversation');
    expect(fetch).toHaveBeenCalledOnce();
    expect(await response.json()).toEqual({ accepted: true });
  });

  it('rejects requests from a different container', async () => {
    const coordinator = {} as DurableObjectNamespace;

    const response = await proxyPushSync(
      new Request('http://course-agent.internal/push-sync', { method: 'POST' }),
      coordinator,
      {
        containerId: 'other-container',
        params: { containerId: 'container-id', sandboxId: 'course-agent-conversation' },
      },
    );

    expect(response.status).toBe(403);
  });
});
