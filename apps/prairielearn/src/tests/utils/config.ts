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

export async function withoutLogging<T>(fn: () => T | Promise<T>): Promise<T> {
  logger.silent = true;
  try {
    return await fn();
  } finally {
    logger.silent = false;
  }
}
