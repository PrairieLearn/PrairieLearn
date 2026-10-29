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

describe('conversation credit', () => {
  it('spends a grant locally across requests and reports the accumulated cost at refill', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime('2026-10-27T03:10:00Z');
    const fetch = vi.fn(async (_url, options: RequestInit) => {
      const request = JSON.parse(options.body as string) as BudgetRequest;
      return grant(request.sequence);
    });
    vi.stubGlobal('fetch', fetch);
    const state = fixture();
    let budget = state.restart();
    for (let i = 0; i < 100; i++) {
      expect(await budget.tryStartRequest(String(i))).toBe(true);
      budget.recordRequestUsage(String(i), {
        ...emptyUsage(),
        inputTokens: 10,
        costMilliDollars: 20,
      });
      if (i === 49) budget = state.restart();
    }
    expect(fetch).toHaveBeenCalledOnce();
    expect(state.saved()).toMatchObject({
      balanceMilliDollars: 1000,
      accounting: { phase: 'idle', usage: { inputTokens: 1000, costMilliDollars: 2000 } },
    });
    expect(await budget.tryStartRequest('expensive')).toBe(true);
    budget.recordRequestUsage('expensive', {
      ...emptyUsage(),
      outputTokens: 200,
      costMilliDollars: 1200,
    });
    expect(await state.restart().tryStartRequest('next')).toBe(true);
    expect(JSON.parse(fetch.mock.calls[1][1].body as string)).toEqual({
      sequence: 2,
      usageDelta: { ...emptyUsage(), inputTokens: 1000, outputTokens: 200, costMilliDollars: 3200 },
      requestCredit: true,
    });
    expect(state.saved().balanceMilliDollars).toBe(2800);
  });

  it('retries a frozen refill after restart without admitting more inference or losing debt', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime('2026-10-27T03:10:00Z');
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(grant(1))
      .mockRejectedValueOnce(new Error('PL unavailable before processing'))
      .mockResolvedValueOnce(grant(2));
    vi.stubGlobal('fetch', fetch);
    const state = fixture();
    const budget = state.restart();
    expect(await budget.tryStartRequest('a')).toBe(true);
    budget.recordRequestUsage('a', { ...emptyUsage(), costMilliDollars: 3400 });
    expect(await budget.tryStartRequest('b')).toBe(false);
    expect(await budget.tryStartRequest('b')).toBe(false);
    const restored = state.restart();
    expect(await restored.resume()).toBe(true);
    expect(fetch.mock.calls[1][1].body).toBe(fetch.mock.calls[2][1].body);
    expect(state.saved()).toMatchObject({
      balanceMilliDollars: 2600,
      accounting: { phase: 'idle', usage: emptyUsage() },
      lastAcknowledgedSequence: 2,
    });
  });

  it('blocks when retrying a committed report whose grant reply was lost', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime('2026-10-27T03:10:00Z');
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error('Reply lost'))
      .mockResolvedValueOnce(
        Response.json(
          { error: { code: 'report_conflict', message: 'The usage report is out of order.' } },
          { status: 409 },
        ),
      );
    vi.stubGlobal('fetch', fetch);
    const state = fixture();
    expect(await state.restart().tryStartRequest('a')).toBe(false);
    const restored = state.restart();
    expect(await restored.resume()).toBe(false);
    expect(await restored.resume()).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(state.saved().blocked).toEqual({ reason: 'usage_unavailable' });
  });

  it('keeps debt through an hourly denial and only refills after explicit Resume is eligible', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime('2026-10-27T03:59:00Z');
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(grant(1))
      .mockResolvedValueOnce(
        Response.json(
          {
            sequence: 2,
            allocation: { status: 'denied', reason: 'hourly_limit', retryAt: expiresAt },
          },
          { status: 429 },
        ),
      )
      .mockResolvedValueOnce(grant(3, '2026-10-27T05:00:00Z'));
    vi.stubGlobal('fetch', fetch);
    const state = fixture();
    const budget = state.restart();
    expect(await budget.tryStartRequest('a')).toBe(true);
    budget.recordRequestUsage('a', { ...emptyUsage(), costMilliDollars: 3400 });
    expect(await budget.tryStartRequest('b')).toBe(false);
    expect(await budget.resume()).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(state.saved().balanceMilliDollars).toBe(-400);
    vi.setSystemTime('2026-10-27T04:01:00Z');
    expect(await budget.tryStartRequest('b')).toBe(false);
    expect(await budget.resume()).toBe(true);
    expect(state.saved()).toMatchObject({
      balanceMilliDollars: 2600,
      blocked: null,
      accounting: { phase: 'idle', usage: emptyUsage() },
    });
    expect(JSON.parse(fetch.mock.calls[2][1].body)).toEqual({
      sequence: 3,
      usageDelta: emptyUsage(),
      requestCredit: true,
    });
  });

  it('expires unused credit without discarding unreported usage', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime('2026-10-27T03:59:00Z');
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(grant(1))
      .mockResolvedValueOnce(grant(2, '2026-10-27T05:00:00Z'));
    vi.stubGlobal('fetch', fetch);
    const state = fixture();
    const budget = state.restart();
    expect(await budget.tryStartRequest('a')).toBe(true);
    budget.recordRequestUsage('a', { ...emptyUsage(), costMilliDollars: 1000 });
    vi.setSystemTime('2026-10-27T04:00:00Z');
    expect(await state.restart().tryStartRequest('b')).toBe(true);
    expect(state.saved().balanceMilliDollars).toBe(3000);
    expect(JSON.parse(fetch.mock.calls[1][1].body).usageDelta.costMilliDollars).toBe(1000);
  });

  it('blocks a restart with unresolved model usage without replaying paid inference', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime('2026-10-27T03:10:00Z');
    const fetch = vi.fn().mockResolvedValueOnce(grant(1));
    vi.stubGlobal('fetch', fetch);
    const state = fixture();
    expect(await state.restart().tryStartRequest('unresolved')).toBe(true);
    const restored = state.restart();
    expect(await restored.tryStartRequest('new')).toBe(false);
    expect(await restored.resume()).toBe(false);
    expect(state.saved().blocked).toEqual({ reason: 'usage_unavailable' });
    expect(fetch).toHaveBeenCalledOnce();
  });
});
