import { expect, it, vi } from 'vitest';

import { watchAutoScalingTargetLifecycleState } from './index.js';

it('retries transient errors and invokes the target callback once', async () => {
  const fetchState = vi
    .fn()
    .mockRejectedValueOnce(new Error('IMDS unavailable'))
    .mockResolvedValueOnce('InService')
    .mockResolvedValue('Terminated');
  const onError = vi.fn();
  const onTargetState = vi.fn(() => {
    throw new Error('callback failed');
  });

  await expect(
    watchAutoScalingTargetLifecycleState({
      targetStates: ['Terminated'],
      pollIntervalMs: 0,
      fetchState,
      onError,
      onTargetState,
    }),
  ).rejects.toThrow('callback failed');
  expect(onError).toHaveBeenCalledOnce();
  expect(onTargetState).toHaveBeenCalledExactlyOnceWith('Terminated');
});

it('stops polling when aborted', async () => {
  const controller = new AbortController();
  const fetchState = vi.fn(async () => {
    controller.abort();
    return 'InService' as const;
  });

  await watchAutoScalingTargetLifecycleState({
    targetStates: ['Terminated'],
    fetchState,
    onTargetState: vi.fn(),
    signal: controller.signal,
  });
  expect(fetchState).toHaveBeenCalledOnce();
});
