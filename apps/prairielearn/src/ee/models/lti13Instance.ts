import { loadSqlEquiv, queryRow, queryRows } from '@prairielearn/postgres';

import { type Lti13Instance, Lti13InstanceSchema } from '../../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);

export async function selectLti13Instance(lti13_instance_id: string): Promise<Lti13Instance> {
  return await queryRow(sql.select_lti13_instance, { lti13_instance_id }, Lti13InstanceSchema);
}

export async function selectLti13InstancesWithConfiguredUin(
  institution_id: string,
): Promise<Lti13Instance[]> {
  return await queryRows(
    sql.select_lti13_instances_with_configured_uin,
    { institution_id },
    Lti13InstanceSchema,
  );
}
