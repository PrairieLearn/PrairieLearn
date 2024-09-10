import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';
import { loadSqlEquiv, queryOptionalRow } from '@prairielearn/postgres';

import { AdministratorSchema, type Institution, InstitutionSchema } from '../../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);

export async function selectAndAuthzInstitutionAsAdmin({
  institution_id,
  user_id,
  access_as_administrator,
}: {
  institution_id: string;
  user_id: string;
  access_as_administrator: boolean;
}): Promise<Institution> {
  const result = await queryOptionalRow(
    sql.select_institution_as_admin,
    { institution_id, user_id },
    z.object({
      institution: InstitutionSchema,
      administrator: AdministratorSchema.nullable(),
      institution_administrator: AdministratorSchema.nullable(),
    }),
  );

  if (
    result == null ||
    (!result.administrator && !result.institution_administrator) ||
    (result.administrator && !access_as_administrator)
  ) {
    throw new HttpStatusError(403, 'Not authorized');
  }

  return result.institution;
}
