import { type AdministratorQuerySpecs, runLegacySqlAdminQuery } from './lib/util.js';

export const specs: AdministratorQuerySpecs = {
  description: 'Course instances usage data.',
  params: [
    {
      name: 'institution_short_name',
      description: 'The short name of the institution (blank means all institutions).',
    },
    {
      name: 'total_start',
      description:
        'Start of the total time period (should be at least 6 months before the term start).',
      default: '2021-01-01T00:00:00',
    },
    {
      name: 'term_start',
      description: 'Start of the term.',
      default: '2021-01-01T00:00:00',
    },
    {
      name: 'active_start',
      description: 'Start of the active date range (the drop deadline in the term).',
      default: '2021-01-01T00:00:00',
    },
    {
      name: 'term_end',
      description: 'End of the term.',
      default: '2022-01-01T00:00:00',
    },
    {
      name: 'total_end',
      description:
        "End of the total time period (should be at least 6 months past the term end, even if that's in the future).",
      default: '2022-01-01T00:00:00',
    },
    {
      name: 'minimum_term_ratio',
      description:
        'Minimum ratio of in-term to total submissions for a course instance to count as active.',
      default: '0.5',
    },
    {
      name: 'minimum_student_count',
      description: 'Minimum number of students for a course instance to count as active.',
      default: '5',
    },
  ],
};

export default async function (params: Record<string, any>) {
  return runLegacySqlAdminQuery(import.meta.url, params);
}
