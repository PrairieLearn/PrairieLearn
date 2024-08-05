import { runSqlAdminQuery } from './util.js';

export default async function (params: Record<string, any>) {
  return runSqlAdminQuery(import.meta.url, params);
}
