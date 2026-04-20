import { z } from 'zod';

import {
  loadSqlEquiv,
  queryOptionalRow,
  queryRow,
  queryRows,
  queryScalars,
} from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { type GroupConfig, GroupConfigSchema } from '../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);

export const GroupUsersRowSchema = z.object({
  group_id: IdSchema,
  name: z.string(),
  size: z.number(),
  users: z.array(z.object({ id: IdSchema, uid: z.string() })),
});
export type GroupUsersRow = z.infer<typeof GroupUsersRowSchema>;

export async function selectGroupConfigForAssessment(
  assessment_id: string,
): Promise<GroupConfig | null> {
  return await queryOptionalRow(
    sql.select_group_config_for_assessment,
    { assessment_id },
    GroupConfigSchema,
  );
}

export async function selectGroupsForConfig(group_config_id: string): Promise<GroupUsersRow[]> {
  return await queryRows(sql.select_groups_for_config, { group_config_id }, GroupUsersRowSchema);
}

export async function selectGroupById({
  group_id,
  assessment_id,
}: {
  group_id: string;
  assessment_id: string;
}): Promise<GroupUsersRow> {
  return await queryRow(sql.select_group_by_id, { group_id, assessment_id }, GroupUsersRowSchema);
}

export async function selectUidsNotInGroup({
  group_config_id,
  course_instance_id,
}: {
  group_config_id: string;
  course_instance_id: string;
}): Promise<string[]> {
  return await queryScalars(
    sql.select_uids_not_in_group,
    { group_config_id, course_instance_id },
    z.string(),
  );
}

/**
 * Returns the UIDs of enrolled (non-instructor) students who are not currently
 * in any group for the given assessment.
 *
 * Every `assessmentGroups` mutation returns this alongside its primary payload
 * so the client can replace its local `notAssigned` state directly. The
 * inclusion rules (enrollment + instructor exclusion) live in the SQL and
 * aren't visible to the client, so deriving this client-side would risk
 * drifting out of sync with the query as it evolves.
 */
export async function selectNotAssignedForAssessment({
  assessment_id,
  course_instance_id,
}: {
  assessment_id: string;
  course_instance_id: string;
}): Promise<string[]> {
  const groupConfig = await selectGroupConfigForAssessment(assessment_id);
  if (!groupConfig) return [];
  return await selectUidsNotInGroup({
    group_config_id: groupConfig.id,
    course_instance_id,
  });
}
