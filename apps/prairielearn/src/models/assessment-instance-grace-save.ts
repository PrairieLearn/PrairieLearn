import { z } from 'zod';

import {
  execute,
  loadSqlEquiv,
  queryOptionalRow,
  queryRow,
  queryScalar,
} from '@prairielearn/postgres';

import {
  type AssessmentInstanceGraceSave,
  AssessmentInstanceGraceSaveSchema,
} from '../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);

/** The caller must hold the assessment lock until the admission transaction commits. */
export async function insertAssessmentInstanceGraceSave(
  graceSave: AssessmentInstanceGraceSave,
): Promise<AssessmentInstanceGraceSave> {
  return await queryRow(sql.insert_grace_save, graceSave, AssessmentInstanceGraceSaveSchema);
}

export async function selectOptionalAssessmentInstanceGraceSave(
  id: string,
): Promise<AssessmentInstanceGraceSave | null> {
  return await queryOptionalRow(
    sql.select_optional_grace_save,
    { id },
    AssessmentInstanceGraceSaveSchema,
  );
}

export async function deleteAssessmentInstanceGraceSave(id: string): Promise<void> {
  await execute(sql.delete_grace_save, { id });
}

/** The caller must hold the assessment lock through the decision to close the assessment. */
export async function hasActiveAssessmentInstanceGraceSaves({
  assessment_instance_id,
  now,
}: {
  assessment_instance_id: string;
  now: Date;
}): Promise<boolean> {
  return await queryScalar(
    sql.has_active_grace_saves,
    { assessment_instance_id, now },
    z.boolean(),
  );
}

export async function deleteExpiredAssessmentInstanceGraceSaves({
  now,
  assessment_instance_id,
}: {
  now: Date;
  assessment_instance_id?: string;
}): Promise<void> {
  await execute(sql.delete_expired_grace_saves, {
    now,
    assessment_instance_id: assessment_instance_id ?? null,
  });
}
