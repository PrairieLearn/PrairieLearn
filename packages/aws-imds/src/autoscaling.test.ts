import { afterEach, expect, it, vi } from 'vitest';

import { watchAutoScalingTargetLifecycleState } from './index.js';

afterEach(() => {
  vi.useRealTimers();
});

it('retries transient errors and invokes the target callback once', async () => {
  vi.useFakeTimers();
  const fetchState = vi
    .fn()
    .mockRejectedValueOnce(new Error('IMDS unavailable'))
    .mockResolvedValueOnce('InService')
    .mockResolvedValue('Terminated');
  const onError = vi.fn();
  const onTargetState = vi.fn();

  watchAutoScalingTargetLifecycleState({
    targetStates: ['Terminated'],
    pollIntervalMs: 1_000,
    fetchState,
    onError,
    onTargetState,
  });
  await vi.advanceTimersByTimeAsync(3_000);

  expect(onError).toHaveBeenCalledOnce();
  expect(onTargetState).toHaveBeenCalledExactlyOnceWith('Terminated');
});

it('stops polling when aborted', async () => {
  vi.useFakeTimers();
  const controller = new AbortController();
  const fetchState = vi.fn().mockResolvedValue('InService');

  watchAutoScalingTargetLifecycleState({
    targetStates: ['Terminated'],
    pollIntervalMs: 1_000,
    fetchState,
    onTargetState: vi.fn(),
    signal: controller.signal,
  });
  await vi.advanceTimersByTimeAsync(0);
  controller.abort();
  await vi.advanceTimersByTimeAsync(2_000);

  expect(fetchState).toHaveBeenCalledOnce();
});
