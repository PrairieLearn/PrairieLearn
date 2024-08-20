import { runLegacySqlAdminQuery } from './util.js';

export default async function (params: Record<string, any>) {
  return runLegacySqlAdminQuery(import.meta.url, params);
}
