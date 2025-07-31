import { type AdministratorQuerySpecs, runLegacySqlAdminQuery } from './lib/util.js';

export const specs: AdministratorQuerySpecs = {
  description: 'Institutions usage data.',
  params: [
    {
      name: 'start_date',
      description: 'Start of the date range (e.g., first day of a year).',
      default: '2021-01-01T00:00:00',
    },
    {
      name: 'end_date',
      description: 'End of the date range (e.g., last day of the year).',
      default: '2022-01-01T00:00:00',
    },
  ],
};

export default async function (params: Record<string, any>) {
  return runLegacySqlAdminQuery(import.meta.url, params);
}
