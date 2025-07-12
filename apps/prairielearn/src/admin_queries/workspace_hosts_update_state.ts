import { type AdministratorQuerySpecs, runLegacySqlAdminQuery } from './lib/util.js';

export const specs: AdministratorQuerySpecs = {
  description: 'Update the state of a workspace host.',
  params: [
    {
      name: 'workspace_host_id',
      description: 'ID of the workspace host to update.',
    },
    {
      name: 'state',
      description:
        'New state to update to (launching, ready, draining, unhealthy, terminating, terminated).',
    },
  ],
};

export default async function (params: Record<string, any>) {
  return runLegacySqlAdminQuery(import.meta.url, params);
}
