import { loadSqlEquiv, queryOptionalRow } from '@prairielearn/postgres';
import { Lti13Instance, Lti13InstanceSchema } from '../../lib/db-types';
import { getInstitutionAuthenticationProviders } from '../lib/institution';

const sql = loadSqlEquiv(__filename);

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

  const instAuthProviders = await getInstitutionAuthenticationProviders(
    lti13_instance.institution_id,
  );

  if (!instAuthProviders.some((a) => a.name === 'LTI 1.3')) {
    throw new Error('Institution does not support LTI 1.3 authentication');
  }

  return lti13_instance;
}
