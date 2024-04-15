import { config } from '../../lib/config';

export function enableEnterpriseEdition() {
  let originalIsEnterprise;

  before(() => {
    originalIsEnterprise = config.isEnterprise;
    config.isEnterprise = true;
  });

  after(() => {
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
