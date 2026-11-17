import { afterEach, expect, it, vi } from 'vitest';

import { fetchImdsText } from './index.js';

afterEach(() => {
  vi.unstubAllGlobals();
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
