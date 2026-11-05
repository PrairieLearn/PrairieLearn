import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { expect, it, vi } from 'vitest';

import { MAX_CONTAINER_INACTIVITY_SECONDS } from './sandbox/sandbox.js';

vi.mock('cloudflare:workers', () => ({ DurableObject: class {}, WorkerEntrypoint: class {} }));
vi.mock('@cloudflare/sandbox', () => ({}));

it('fits every turn and idle budget within the container inactivity limit', async () => {
  const text = await readFile(path.join(import.meta.dirname, '../wrangler.jsonc'), 'utf8');
  const config = JSON.parse(text.replaceAll(/^\s*\/\/.*$/gm, ''));
  for (const { vars } of [config, ...Object.values<{ vars: Env }>(config.env)]) {
    expect(Number(vars.AGENT_TURN_SECONDS) + Number(vars.USER_IDLE_SECONDS)).toBeLessThanOrEqual(
      MAX_CONTAINER_INACTIVITY_SECONDS,
    );
  }
});
