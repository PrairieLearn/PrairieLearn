import { type Config, config } from '../../lib/config.js';

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

/**
 * Runs `fn` with the given feature flags merged into `config.features`. Use
 * this instead of `withConfig({ features: ... })`, which replaces the whole
 * record and thus silently disables any default-enabled features.
 */
export async function withFeatures<T>(
  features: Record<string, boolean>,
  fn: () => T | Promise<T>,
): Promise<T> {
  return await withConfig({ features: { ...config.features, ...features } }, fn);
}
