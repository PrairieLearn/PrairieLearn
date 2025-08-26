import { logger } from '@prairielearn/logger';

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
 * Temporarily set the logger to silent.
 *
 * @param fn - The function to run with the logger set to silent.
 * @param options
 * @param options.silent - Whether to set the logger to silent (default: true).
 * @returns The result of the function.
 */
export async function withoutLogging<T>(
  fn: () => T | Promise<T>,
  { silent = true }: { silent?: boolean } = {},
): Promise<T> {
  logger.silent = silent;
  try {
    return await fn();
  } finally {
    logger.silent = false;
  }
}
