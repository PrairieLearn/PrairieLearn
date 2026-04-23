import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import tmp from 'tmp-promise';
import { assert, beforeEach, describe, expect, it } from 'vitest';

import { withConfig } from '../../tests/utils/config.js';

import {
  getRespondusLockdownBrowser,
  initRespondusLockdownBrowser,
  requireRespondusLockdownBrowser,
  resetRespondusLockdownBrowserForTesting,
} from './respondus-lockdown-browser-library.js';

async function writePlaintextBundle(dir: string, code: string, filename = 'bundle.js') {
  const p = path.join(dir, filename);
  await fs.writeFile(p, code);
  return p;
}

const MINIMAL_BUNDLE = `
  module.exports = {
    generateLaunchLink: (options) => 'ldb:test:' + options.keys.join(','),
  };
`;

describe('Respondus LockDown Browser library', () => {
  beforeEach(() => {
    resetRespondusLockdownBrowserForTesting();
  });

  it('is a no-op when both config fields are unset', async () => {
    await withConfig(
      { respondusLockdownBrowserSourcePath: null, respondusLockdownBrowserKeys: null },
      async () => {
        await initRespondusLockdownBrowser();
        assert.isNull(getRespondusLockdownBrowser());
      },
    );
  });

  it('delegates sourcePath to loadLibrary', async () => {
    await tmp.withDir(
      async ({ path: dir }) => {
        const bundlePath = await writePlaintextBundle(dir, MINIMAL_BUNDLE);
        await withConfig(
          {
            respondusLockdownBrowserSourcePath: bundlePath,
            respondusLockdownBrowserKeys: null,
            devMode: true,
          },
          async () => {
            await initRespondusLockdownBrowser();
            assert.equal(
              requireRespondusLockdownBrowser().generateLaunchLink({
                keys: ['a'],
                restartUrl: 'http://x',
              }),
              'ldb:test:a',
            );
          },
        );
      },
      { unsafeCleanup: true },
    );
  });

  it('rejects sourcePath outside of devMode', async () => {
    await tmp.withDir(
      async ({ path: dir }) => {
        const bundlePath = await writePlaintextBundle(dir, MINIMAL_BUNDLE);
        await withConfig(
          {
            devMode: false,
            respondusLockdownBrowserSourcePath: bundlePath,
            respondusLockdownBrowserKeys: null,
          },
          async () => {
            await expect(initRespondusLockdownBrowser()).rejects.toThrow(/only allowed in devMode/);
          },
        );
      },
      { unsafeCleanup: true },
    );
  });

  it('requireRespondusLockdownBrowser throws when the library is unset', () => {
    resetRespondusLockdownBrowserForTesting();
    assert.throws(() => requireRespondusLockdownBrowser(), /not loaded/);
  });
});
