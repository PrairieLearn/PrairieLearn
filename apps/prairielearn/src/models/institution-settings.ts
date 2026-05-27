import { loadSqlEquiv, queryOptionalRow, queryRow } from '@prairielearn/postgres';

import { type InstitutionSettings, InstitutionSettingsSchema } from '../lib/db-types.js';

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
}: {
  institution_id: string;
  course_request_message: string | null;
}): Promise<InstitutionSettings> {
  return await queryRow(
    sql.upsert_institution_settings,
    { institution_id, course_request_message },
    InstitutionSettingsSchema,
  );
}
