import { v4 as uuidv4 } from 'uuid';

import type { AdministratorQueryResult } from './util.js';

export default async function ({ count }: { count: string }): Promise<AdministratorQueryResult> {
  const rows = Array.from(Array(Number(count)), () => ({ uuid: uuidv4() }));
  return { rows, columns: ['uuid'] };
}
