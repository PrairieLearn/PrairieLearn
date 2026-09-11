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
  it('routes rendering only through the owning sandbox and rejects arbitrary internal paths', async () => {
    const fetch = vi.fn((_request: Request) => Response.json({ result: null }));
    const coordinator = {
      idFromName: () => 'id',
      get: () => ({ fetch }),
    } as unknown as DurableObjectNamespace;
    const context = {
      containerId: 'container-id',
      params: { containerId: 'container-id', sandboxId: 'sandbox' },
    };
    const result = await proxyPushSync(
      new Request('http://course-agent.internal/render-question-variant', {
        method: 'POST',
        body: '{"qid":"question"}',
      }),
      coordinator,
      context,
    );
    expect(result.ok).toBe(true);
    expect(new URL(fetch.mock.calls[0][0].url).pathname).toBe('/render-question-variant');
    expect(
      (
        await proxyPushSync(
          new Request('http://course-agent.internal/admin', { method: 'POST' }),
          coordinator,
          context,
        )
      ).status,
    ).toBe(404);
  });
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
        headers: { 'X-Course-Agent-Approval-Protocol': 'blocking-v1' },
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

  it('rejects the legacy non-blocking tool before creating an approval', async () => {
    const get = vi.fn();
    const response = await proxyPushSync(
      new Request('http://course-agent.internal/push-sync', { method: 'POST' }),
      { get } as unknown as DurableObjectNamespace,
      {
        containerId: 'container-id',
        params: { containerId: 'container-id', sandboxId: 'course-agent-conversation' },
      },
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: expect.stringContaining('outdated publication tool'),
    });
    expect(get).not.toHaveBeenCalled();
  });
});
