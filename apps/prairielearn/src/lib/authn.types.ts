import z from 'zod';

import { InstitutionSchema, UserSchema } from './db-types.js';

export interface LoadUserAuth {
  uid?: string;
  uin?: string | null;
  name?: string | null;
  email?: string | null;
  provider: string;
  /** If present, skip the users_select_or_insert call */
  user_id?: number | string;
  institution_id?: number | string | null;
}

export const SelectUserSchema = z.object({
  user: UserSchema,
  institution: InstitutionSchema,
  is_administrator: z.boolean(),
});
type SelectUser = z.infer<typeof SelectUserSchema>;

export interface ResLocalsAuthnUser {
  authn_user: SelectUser['user'];
  authn_institution: SelectUser['institution'];
  authn_provider_name: LoadUserAuth['provider'];
  authn_is_administrator: SelectUser['is_administrator'];
  access_as_administrator: boolean;
  is_administrator: boolean;
  is_institution_administrator: boolean;
}
