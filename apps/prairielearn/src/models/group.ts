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

const GroupUsersRowSchema = z.object({
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

export async function selectGroupRoleNamesForAssessment(assessment_id: string): Promise<string[]> {
  return await queryScalars(
    sql.select_group_role_names_for_assessment,
    { assessment_id },
    z.string(),
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
