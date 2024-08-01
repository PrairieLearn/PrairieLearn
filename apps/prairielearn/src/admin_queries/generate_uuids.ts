import { v4 as uuidv4 } from 'uuid';

import type { AdministratorQueryResult } from './index.types.js';

export default async function (params: Record<string, any>): Promise<AdministratorQueryResult> {
  const rows = Array.from(Array(Number(params.count))).map(() => ({ uuid: uuidv4() }));
  return { rows, columns: ['uuid'] };
}
