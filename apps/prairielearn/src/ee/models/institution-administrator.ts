import { loadSqlEquiv, queryOptionalRow, runInTransactionAsync } from '@prairielearn/postgres';

import { InstitutionAdministratorSchema } from '../../lib/db-types.js';
import { insertAuditLog } from '../../models/audit-log.js';

const sql = loadSqlEquiv(import.meta.url);

export async function ensureInstitutionAdministrator({
  user_id,
  institution_id,
  authn_user_id,
}: {
  user_id: string;
  institution_id: string;
  authn_user_id: string;
}) {
  await runInTransactionAsync(async () => {
    const institution_admin = await queryOptionalRow(
      sql.ensure_institution_admin,
      { user_id, institution_id },
      InstitutionAdministratorSchema,
    );

    if (institution_admin) {
      await insertAuditLog({
        authn_user_id,
        table_name: 'institution_administrators',
        action: 'insert',
        institution_id: institution_admin.institution_id,
        user_id: institution_admin.user_id,
        row_id: institution_admin.id,
        new_state: institution_admin,
      });
    }

    return institution_admin;
  });
}

export async function deleteInstitutionAdministrator({
  institution_id,
  unsafe_institution_administrator_id,
  authn_user_id,
}: {
  institution_id: string;
  unsafe_institution_administrator_id: string;
  authn_user_id: string;
}) {
  await runInTransactionAsync(async () => {
    const institution_admin = await queryOptionalRow(
      sql.delete_institution_admin,
      {
        institution_id,
        unsafe_institution_administrator_id,
      },
      InstitutionAdministratorSchema,
    );

    if (institution_admin) {
      await insertAuditLog({
        authn_user_id,
        table_name: 'institution_administrators',
        action: 'delete',
        institution_id: institution_admin.institution_id,
        user_id: institution_admin.user_id,
        row_id: institution_admin.id,
        old_state: institution_admin,
      });
    }

    return institution_admin;
  });
}
