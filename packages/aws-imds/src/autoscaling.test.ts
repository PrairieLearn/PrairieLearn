import { afterEach, expect, it, vi } from 'vitest';

import { fetchImdsText, watchAutoScalingTargetLifecycleState } from './index.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

it('retries transient errors and invokes the target callback once', async () => {
  const fetchState = vi
    .fn()
    .mockRejectedValueOnce(new Error('IMDS unavailable'))
    .mockResolvedValueOnce('InService')
    .mockResolvedValue('Terminated');
  const onError = vi.fn();
  const onTargetState = vi.fn();

  await watchAutoScalingTargetLifecycleState({
    targetStates: ['Terminated'],
    pollIntervalMs: 0,
    fetchState,
    onError,
    onTargetState,
  });
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

it('refreshes the cached IMDS token after a 401 response', async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(new Response('expired-token'))
    .mockResolvedValueOnce(new Response(null, { status: 401 }))
    .mockResolvedValueOnce(new Response('fresh-token'))
    .mockResolvedValueOnce(new Response('metadata'));
  vi.stubGlobal('fetch', fetchMock);

  await expect(fetchImdsText('/latest/meta-data/example')).resolves.toBe('metadata');

  expect(fetchMock).toHaveBeenCalledTimes(4);
  expect(fetchMock).toHaveBeenNthCalledWith(
    3,
    'http://169.254.169.254/latest/api/token',
    expect.objectContaining({ method: 'PUT' }),
  );
  expect(fetchMock).toHaveBeenNthCalledWith(
    4,
    'http://169.254.169.254/latest/meta-data/example',
    expect.objectContaining({
      headers: { 'X-aws-ec2-metadata-token': 'fresh-token' },
    }),
  );
});
