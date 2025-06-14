import { type Config, config } from '../../lib/config.js';

export async function withConfig(overrides: Partial<Config>, fn: () => Promise<void>) {
  const originalConfig = structuredClone(config);
  Object.assign(config, originalConfig, overrides);
  try {
    await fn();
  } finally {
    Object.assign(config, originalConfig);
  }
}
