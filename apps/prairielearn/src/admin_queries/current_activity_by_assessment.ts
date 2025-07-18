import { type AdministratorQuerySpecs, runLegacySqlAdminQuery } from './lib/util.js';

export const specs: AdministratorQuerySpecs = {
  description: 'Assessments that have had submissions within a recent time interval.',
  params: [
    {
      name: 'interval',
      description:
        "How far back in time to look from the current time. Use expressions like '10 minutes' or '5 days'.",
      default: '10 minutes',
    },
    {
      name: 'limit',
      description: 'The maximum number of results to return.',
      default: '1000',
    },
  ],
};

export default async function (params: Record<string, any>) {
  return runLegacySqlAdminQuery(import.meta.url, params);
}
