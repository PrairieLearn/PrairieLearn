import { expect, it } from 'vitest';

import { withConfig } from '../tests/utils/config.js';

import { getPrintingCloudflareConfig } from './config.js';

it('uses local rendering when Cloudflare credentials are absent', async () => {
  await withConfig({ printingCloudflareAccountId: null, printingCloudflareApiToken: null }, () => {
    expect(getPrintingCloudflareConfig()).toBeUndefined();
  });
});

it.each([
  { host: 'chunks consumer', chunksConsumer: true, devMode: false },
  { host: 'local development', chunksConsumer: false, devMode: true },
  { host: 'main production server', chunksConsumer: false, devMode: false },
])('uses Cloudflare on a $host when configured', async ({ chunksConsumer, devMode }) => {
  await withConfig(
    {
      printingCloudflareAccountId: 'account',
      printingCloudflareApiToken: 'token',
      chunksConsumer,
      devMode,
    },
    () => {
      expect(getPrintingCloudflareConfig()).toEqual({ accountId: 'account', apiToken: 'token' });
    },
  );
});

it.each([
  { printingCloudflareAccountId: 'account', printingCloudflareApiToken: null },
  { printingCloudflareAccountId: null, printingCloudflareApiToken: 'token' },
  { printingCloudflareAccountId: '', printingCloudflareApiToken: '' },
])('rejects incomplete Cloudflare credentials', async (overrides) => {
  await withConfig(overrides, () => {
    expect(getPrintingCloudflareConfig).toThrow(
      'printingCloudflareAccountId and printingCloudflareApiToken must both be set',
    );
  });
});
