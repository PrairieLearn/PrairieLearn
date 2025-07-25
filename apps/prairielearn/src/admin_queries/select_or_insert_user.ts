import { type AdministratorQuerySpecs, runLegacySqlAdminQuery } from './lib/util.js';

export const specs: AdministratorQuerySpecs = {
  description: 'Select or insert a user from the users table.',
  params: [
    { name: 'name', description: 'Full name of the user.' },
    { name: 'uid', description: "The user's UID (including email address)." },
    { name: 'uin', description: "The user's UIN (leave blank to not insert a UIN)." },
    { name: 'email', description: "The user's email (leave blank to not insert an email)." },
  ],
};

export default async function (params: Record<string, any>) {
  return runLegacySqlAdminQuery(import.meta.url, params);
}
