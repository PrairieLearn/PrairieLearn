import { type AdministratorQuerySpecs, runLegacySqlAdminQuery } from './lib/util.js';

export const specs: AdministratorQuerySpecs = {
  description: 'Queries currently running in the DB.',
  resultFormats: { query: 'pre' },
};

export default async function (params: Record<string, any>) {
  return runLegacySqlAdminQuery(import.meta.url, params);
}
