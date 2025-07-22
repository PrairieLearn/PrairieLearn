import { type AdministratorQuerySpecs, runLegacySqlAdminQuery } from './lib/util.js';

export const specs: AdministratorQuerySpecs = {
  description: 'Course instances that are active within a given date range.',
  params: [
    {
      name: 'institution_short_name',
      description: 'The short name of the institution (required).',
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
      name: 'minimum_instance_question_count',
      description: 'Minimum number of modified instance questions for a student to be included.',
      default: '10',
    },
  ],
};

export default async function (params: Record<string, any>) {
  return runLegacySqlAdminQuery(import.meta.url, params);
}
