import { loadSqlEquiv, queryOptionalRow } from '@prairielearn/postgres';

import { type Lti13Instance, Lti13InstanceSchema } from '../../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);

export async function selectLti13Instance(lti13_instance_id: string): Promise<Lti13Instance> {
  const lti13_instance = await queryOptionalRow(
    sql.select_lti13_instance,
    {
      lti13_instance_id,
    },
    Lti13InstanceSchema,
  );

  if (!lti13_instance) {
    throw new Error(`LTI 1.3 instance ID ${lti13_instance_id} is unavailable`);
  }

  return lti13_instance;
}
