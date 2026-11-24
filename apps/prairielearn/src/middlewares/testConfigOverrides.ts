import type { RequestHandler } from 'express';

import { type Config, config } from '../lib/config.js';

let originalConfig: Config | null = null;

/**
 * Replaces any previously applied overrides with the config overrides in the
 * request body. This lets Playwright tests that need different config values
 * share a single server instead of booting a new one for each config.
 */
export default (function testConfigOverrides(req, res) {
  // The body is deliberately not parsed with `ConfigSchema.partial()`, since
  // that would fill in defaults for every key that isn't overridden.
  const overrides: Partial<Config> = req.body;
  originalConfig ??= structuredClone(config);
  Object.assign(config, structuredClone(originalConfig), overrides);
  res.sendStatus(204);
}) satisfies RequestHandler;
