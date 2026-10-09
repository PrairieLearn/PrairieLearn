import { expect, it } from 'vitest';

import { withConfig } from '../tests/utils/config.js';

import { getPrintingCloudflareConfig } from './config.js';

it('uses local rendering when Cloudflare credentials are absent', async () => {
  await withConfig({ printingCloudflareAccountId: null, printingCloudflareApiToken: null }, () => {
    expect(getPrintingCloudflareConfig()).toBeUndefined();
  });
});

it('uses Cloudflare when both credentials are configured', async () => {
  await withConfig(
    {
      printingCloudflareAccountId: 'account',
      printingCloudflareApiToken: 'token',
      chunksConsumer: true,
      devMode: false,
    },
    () => {
      expect(getPrintingCloudflareConfig()).toEqual({ accountId: 'account', apiToken: 'token' });
    },
  );
});

it('allows local development to use Cloudflare', async () => {
  await withConfig(
    {
      printingCloudflareAccountId: 'account',
      printingCloudflareApiToken: 'token',
      chunksConsumer: false,
      devMode: true,
    },
    () => {
      expect(getPrintingCloudflareConfig()).toEqual({ accountId: 'account', apiToken: 'token' });
    },
  );
});

it('does not use Cloudflare on a main production server', async () => {
  await withConfig(
    {
      printingCloudflareAccountId: 'account',
      printingCloudflareApiToken: 'token',
      chunksConsumer: false,
      devMode: false,
    },
    () => {
      expect(getPrintingCloudflareConfig()).toBeUndefined();
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
