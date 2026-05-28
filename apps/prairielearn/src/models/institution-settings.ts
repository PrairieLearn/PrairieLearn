import { z } from 'zod';

import {
  loadSqlEquiv,
  queryOptionalRow,
  queryRow,
  runInTransactionAsync,
} from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { type InstitutionSettings, InstitutionSettingsSchema } from '../lib/db-types.js';

import { insertAuditEvent } from './audit-event.js';

const sql = loadSqlEquiv(import.meta.url);

export async function selectInstitutionSettings({
  institution_id,
}: {
  institution_id: string;
}): Promise<InstitutionSettings | null> {
  return await queryOptionalRow(
    sql.select_institution_settings,
    { institution_id },
    InstitutionSettingsSchema,
  );
}

export async function updateInstitutionCourseRequestMessage({
  institution_id,
  course_request_message,
  authn_user_id,
}: {
  institution_id: string;
  course_request_message: string | null;
  authn_user_id: string;
}): Promise<InstitutionSettings> {
  return await runInTransactionAsync(async () => {
    await queryRow(sql.lock_institution, { institution_id }, z.object({ id: IdSchema }));

    const oldSettings = await queryOptionalRow(
      sql.select_institution_settings,
      { institution_id },
      InstitutionSettingsSchema,
    );
    const updatedSettings = await queryRow(
      sql.upsert_institution_settings,
      { institution_id, course_request_message },
      InstitutionSettingsSchema,
    );

    await insertAuditEvent({
      tableName: 'institution_settings',
      action: oldSettings == null ? 'insert' : 'update',
      actionDetail: 'course_request_message',
      rowId: institution_id,
      institutionId: institution_id,
      oldRow: oldSettings ?? undefined,
      newRow: updatedSettings,
      agentAuthnUserId: authn_user_id,
      agentUserId: authn_user_id,
    });

    return updatedSettings;
  });
}
