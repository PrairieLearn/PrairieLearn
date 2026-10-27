import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  type BudgetRequest,
  type BudgetResponse,
  emptyUsage,
} from '@prairielearn/course-agent-types';

import { type BudgetState, ConversationBudget } from './budget.js';

function fixture() {
  const values = new Map<string, unknown>();
  const storage = {
    kv: {
      get: <T>(key: string) => structuredClone(values.get(key)) as T | undefined,
      put: (key: string, value: unknown) => {
        values.set(key, structuredClone(value));
      },
    },
  } as unknown as DurableObjectStorage;
  const env = { PL_SERVICE_URL: 'https://pl.test', PL_SERVICE_TOKEN: 'token' };
  return {
    restart: () => new ConversationBudget(storage, env, 'conversation', () => {}),
    saved: () => storage.kv.get<BudgetState>('budget')!,
  };
}

const expiresAt = '2026-10-27T04:00:00Z';

function grant(sequence: number, creditExpiresAt = expiresAt) {
  return Response.json({
    sequence,
    allocation: { status: 'granted', grantedMilliDollars: 3000, expiresAt: creditExpiresAt },
  } satisfies BudgetResponse);
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('durable usage delivery', () => {
  it('replays a frozen delta after restart without losing newer usage or charging it twice', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime('2026-10-27T03:10:00Z');
    const requests: BudgetRequest[] = [];
    let loseReply = true;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url, options: RequestInit) => {
        const body = JSON.parse(options.body as string) as BudgetRequest;
        requests.push(body);
        if (body.sequence === 2 && loseReply) {
          loseReply = false;
          throw new Error('Reply lost');
        }
        return body.requestCredit
          ? grant(body.sequence)
          : Response.json({ sequence: body.sequence, allocation: { status: 'not_requested' } });
      }),
    );
    const state = fixture();
    let budget = state.restart();
    expect(await budget.ensureCredit()).toBe(true);
    budget.begin('a');
    budget.settle('a', { ...emptyUsage(), inputTokens: 100, costMilliDollars: 400 });
    await budget.report(false);
    budget.begin('b');
    budget.settle('a', { ...emptyUsage(), costMilliDollars: 400 });
    budget.settle('b', { ...emptyUsage(), outputTokens: 200, costMilliDollars: 2800 });
    budget = state.restart();
    expect(await budget.ensureCredit()).toBe(true);
    expect(requests.map((request) => request.sequence)).toEqual([1, 2, 2, 3]);
    expect(requests[1]).toEqual(requests[2]);
    expect(requests[3].usageDelta).toEqual({
      ...emptyUsage(),
      outputTokens: 200,
      costMilliDollars: 2800,
    });
    expect(state.saved()).toMatchObject({
      balanceMilliDollars: 2800,
      pendingRequest: null,
      lastAcknowledgedSequence: 3,
      unreportedUsage: emptyUsage(),
    });
  });

  it('recovers a lost grant reply once and does not prefetch another chunk', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime('2026-10-27T03:10:00Z');
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error('Reply lost'))
      .mockResolvedValueOnce(grant(1));
    vi.stubGlobal('fetch', fetch);
    const state = fixture();
    expect(await state.restart().ensureCredit()).toBe(false);
    const restored = state.restart();
    expect(await restored.resume()).toBe(true);
    expect(await restored.ensureCredit()).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0][1].body).toBe(fetch.mock.calls[1][1].body);
    expect(state.saved().balanceMilliDollars).toBe(3000);
  });

  it('keeps debt through a lost denial and requests a fresh decision on explicit Resume', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime('2026-10-27T03:59:00Z');
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(grant(1))
      .mockRejectedValueOnce(new Error('Denial reply lost'))
      .mockResolvedValueOnce(
        Response.json(
          {
            sequence: 2,
            allocation: {
              status: 'denied',
              reason: 'hourly_limit',
              retryAt: expiresAt,
            },
          },
          { status: 429 },
        ),
      )
      .mockResolvedValueOnce(grant(3, '2026-10-27T05:00:00Z'));
    vi.stubGlobal('fetch', fetch);
    const state = fixture();
    const budget = state.restart();
    await budget.ensureCredit();
    budget.begin('a');
    budget.settle('a', { ...emptyUsage(), costMilliDollars: 3400 });
    await budget.reportCompletedRequest();
    expect(fetch).toHaveBeenCalledOnce();
    expect(await budget.ensureCredit()).toBe(false);
    expect(await budget.resume()).toBe(false);
    expect(state.saved().balanceMilliDollars).toBe(-400);
    vi.setSystemTime('2026-10-27T04:01:00Z');
    expect(await budget.resume()).toBe(true);
    expect(state.saved()).toMatchObject({
      balanceMilliDollars: 2600,
      blocked: null,
      lastAcknowledgedSequence: 3,
    });
    expect(JSON.parse(fetch.mock.calls[3][1].body)).toMatchObject({
      sequence: 3,
      usageDelta: emptyUsage(),
      requestCredit: true,
    });
  });

  it('blocks a restart with unresolved model usage without replaying paid inference', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime('2026-10-27T03:10:00Z');
    const fetch = vi.fn().mockResolvedValueOnce(grant(1));
    vi.stubGlobal('fetch', fetch);
    const state = fixture();
    const budget = state.restart();
    await budget.ensureCredit();
    budget.begin('unresolved');
    const restored = state.restart();
    restored.recover();
    expect(await restored.ensureCredit()).toBe(false);
    expect(await restored.resume()).toBe(false);
    expect(state.saved().blocked).toEqual({ reason: 'usage_unavailable' });
    expect(fetch).toHaveBeenCalledOnce();
  });
});
