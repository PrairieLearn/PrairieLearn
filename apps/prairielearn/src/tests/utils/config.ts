import { type Config, config } from '../../lib/config.js';

export function withConfig<T>(overrides: Partial<Config>, fn: () => T): T {
  const originalConfig = structuredClone(config);
  Object.assign(config, originalConfig, overrides);
  try {
    return fn();
  } finally {
    Object.assign(config, originalConfig);
  }
}
