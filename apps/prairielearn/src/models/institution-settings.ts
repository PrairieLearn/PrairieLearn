import { loadSqlEquiv, queryOptionalRow, queryRow } from '@prairielearn/postgres';

import { type InstitutionSetting, InstitutionSettingSchema } from '../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);

export async function selectInstitutionSettings({
  institution_id,
}: {
  institution_id: string;
}): Promise<InstitutionSetting | null> {
  return await queryOptionalRow(
    sql.select_institution_settings,
    { institution_id },
    InstitutionSettingSchema,
  );
}

export async function updateInstitutionCourseRequestMessage({
  institution_id,
  course_request_message,
}: {
  institution_id: string;
  course_request_message: string | null;
}): Promise<InstitutionSetting> {
  return await queryRow(
    sql.upsert_institution_settings,
    { institution_id, course_request_message },
    InstitutionSettingSchema,
  );
}
