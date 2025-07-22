import { v4 as uuidv4 } from 'uuid';

import type { AdministratorQueryResult, AdministratorQuerySpecs } from './lib/util.js';

export const specs: AdministratorQuerySpecs = {
  description: 'Generate random UUIDs for use in info files',
  params: [{ name: 'count', description: 'Number of UUIDs to generate (integer)', default: '5' }],
};

export default async function ({ count }: { count: string }): Promise<AdministratorQueryResult> {
  const rows = Array.from(Array(Number(count)), () => ({ uuid: uuidv4() }));
  return { rows, columns: ['uuid'] };
}
