import { afterAll, beforeAll } from 'vitest';

import { config } from '../../lib/config.js';

export function enableEnterpriseEdition() {
  let originalIsEnterprise: boolean;

  beforeAll(() => {
    originalIsEnterprise = config.isEnterprise;
    config.isEnterprise = true;
  });

  afterAll(() => {
    config.isEnterprise = originalIsEnterprise;
  });
}

export async function withoutEnterpriseEdition<T>(fn: () => T | Promise<T>): Promise<T> {
  const originalIsEnterprise = config.isEnterprise;
  try {
    config.isEnterprise = false;
    return await fn();
  } finally {
    config.isEnterprise = originalIsEnterprise;
  }
}
