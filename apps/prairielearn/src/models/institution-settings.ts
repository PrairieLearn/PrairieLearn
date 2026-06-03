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
import type { SupportedActionsForTable } from './audit-event.types.js';

const sql = loadSqlEquiv(import.meta.url);

export const COURSE_REQUEST_MESSAGE_MAX_LENGTH = 10000;

type InstitutionSettingField = SupportedActionsForTable<'institution_settings'>;

const UPSERT_SQL: Record<InstitutionSettingField, string> = {
  course_request_message: sql.upsert_course_request_message,
  github_course_owner: sql.upsert_github_course_owner,
};

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

export async function updateInstitutionSetting({
  institution_id,
  field,
  value,
  authn_user_id,
}: {
  institution_id: string;
  field: InstitutionSettingField;
  value: string | null;
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
      UPSERT_SQL[field],
      { institution_id, value },
      InstitutionSettingsSchema,
    );

    await insertAuditEvent({
      tableName: 'institution_settings',
      action: oldSettings == null ? 'insert' : 'update',
      actionDetail: field,
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
