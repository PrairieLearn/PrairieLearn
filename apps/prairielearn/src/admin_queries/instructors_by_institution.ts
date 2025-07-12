import { type AdministratorQuerySpecs, runLegacySqlAdminQuery } from './lib/util.js';

export const specs: AdministratorQuerySpecs = {
  description: 'Return a list of instructors by institution',
  params: [
    {
      name: 'institution_shortname',
      description: 'Institution short name',
      default: 'Default',
    },
    {
      name: 'course_roles',
      default: '{Editor, Owner}',
      description: 'Filter to course staff with the included course roles only',
    },
  ],
};

export default async function (params: Record<string, any>) {
  return runLegacySqlAdminQuery(import.meta.url, params);
}
