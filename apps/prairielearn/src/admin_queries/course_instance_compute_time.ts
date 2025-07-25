import { type AdministratorQuerySpecs, runLegacySqlAdminQuery } from './lib/util.js';

export const specs: AdministratorQuerySpecs = {
  description: 'Course instances compute time within a given date range.',
  params: [
    {
      name: 'institution_short_name',
      description: 'Restrict to a particular institution (blank means all institutions).',
    },
    {
      name: 'start_date',
      description: 'Start of the date range (e.g., first day of the academic year).',
      default: '2021-01-01T00:00:00',
    },
    {
      name: 'end_date',
      description: 'End of the date range (e.g., last day of the academic year).',
      default: '2022-01-01T00:00:00',
    },
    {
      name: 'minimum_compute_hours',
      description: 'Minimum compute hours in a course instance to be included.',
      default: '1',
    },
  ],
};

export default async function (params: Record<string, any>) {
  return runLegacySqlAdminQuery(import.meta.url, params);
}
