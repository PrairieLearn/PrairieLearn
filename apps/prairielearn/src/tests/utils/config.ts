import { type Config, config } from '../../lib/config.js';

// Re-export withoutLogging from @prairielearn/logger for convenience.
export { withoutLogging } from '@prairielearn/logger';

export async function withConfig<T>(
  overrides: Partial<Config>,
  fn: () => T | Promise<T>,
): Promise<T> {
  const originalConfig = structuredClone(config);
  Object.assign(config, originalConfig, overrides);
  try {
    return await fn();
  } finally {
    Object.assign(config, originalConfig);
  }
}
