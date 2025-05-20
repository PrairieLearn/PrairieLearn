import { afterAll, beforeAll } from 'vitest';

import { config } from '../../lib/config.js';

export function enableEnterpriseEdition() {
  let originalIsEnterprise;

  beforeAll(() => {
    originalIsEnterprise = config.isEnterprise;
    config.isEnterprise = true;
    console.log('Enterprise edition enabled for tests');
  });

  afterAll(() => {
    config.isEnterprise = originalIsEnterprise;
    console.log('Enterprise edition disabled for tests');
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
