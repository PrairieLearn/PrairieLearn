import { type AdministratorQuerySpecs, runLegacySqlAdminQuery } from './lib/util.js';

export const specs: AdministratorQuerySpecs = {
  description: 'Terminate a running query (hard kill).',
  params: [{ name: 'pid', description: 'PID of the backend process to terminate.' }],
};

export default async function (params: Record<string, any>) {
  return runLegacySqlAdminQuery(import.meta.url, params);
}
