import { loadSqlEquiv, queryRow, queryRows } from '@prairielearn/postgres';

import { type Lti13Instance, Lti13InstanceSchema } from '../../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);

export async function selectLti13Instance(lti13_instance_id: string): Promise<Lti13Instance> {
  return await queryRow(sql.select_lti13_instance, { lti13_instance_id }, Lti13InstanceSchema);
}

export async function selectLti13InstanceForUpdate(
  institution_id: string,
  lti13_instance_id: string,
): Promise<Lti13Instance> {
  return await queryRow(
    sql.select_lti13_instance_for_update,
    { institution_id, lti13_instance_id },
    Lti13InstanceSchema,
  );
}

export async function selectLti13InstancesWithRosterSyncPermitted(
  institution_id: string,
): Promise<Lti13Instance[]> {
  return await queryRows(
    sql.select_lti13_instances_with_roster_sync_permitted,
    { institution_id },
    Lti13InstanceSchema,
  );
}
