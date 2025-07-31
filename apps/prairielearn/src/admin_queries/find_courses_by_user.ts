import { type AdministratorQuerySpecs, runLegacySqlAdminQuery } from './lib/util.js';

export const specs: AdministratorQuerySpecs = {
  description: 'Finds users and their courses.',
  params: [{ name: 'user_regexp', description: 'Regexp to match against UID or user name.' }],
};

export default async function (params: Record<string, any>) {
  return runLegacySqlAdminQuery(import.meta.url, params);
}
