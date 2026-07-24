import { z } from 'zod';

import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { isInstitutionalAuthenticationProvider } from '../lib/authn-provider-classification.js';
import { AuthnProviderSchema } from '../lib/db-types.js';
import { getLti13UinConfigurationIssues } from '../lib/institution-identity.js';

import type { AdministratorQueryResult, AdministratorQuerySpecs } from './lib/util.js';

const sql = loadSqlEquiv(import.meta.url);

const ReadinessRowSchema = z.object({
  institution_id: IdSchema,
  institution_short_name: z.string(),
  institution_long_name: z.string(),
  lti13_instance_id: IdSchema,
  lti13_instance_name: z.string(),
  platform: z.string(),
  lti13_uin_attribute: z.string().nullable(),
  saml_uin_attribute: z.string().nullable(),
  enabled_authn_provider_names: AuthnProviderSchema.shape.name.unwrap().array(),
  active_lti13_instances_without_uin_count: z.coerce.number(),
  users_without_uin_count: z.coerce.number(),
});

export const specs: AdministratorQuerySpecs = {
  description:
    'Inventory active LTI 1.3 instances, institution identity prerequisites, and UIN backfill gaps before roster-sync rollout.',
  resultFormats: { follow_up_tasks: 'pre' },
};

export default async function (): Promise<AdministratorQueryResult> {
  const rows = await queryRows(sql.select_lti13_roster_sync_readiness, ReadinessRowSchema);

  return {
    columns: [
      'institution_id',
      'institution',
      'lti13_instance_id',
      'lti13_instance',
      'platform',
      'lti13_uin_attribute',
      'saml_uin_attribute',
      'enabled_institutional_authn_providers',
      'users_without_uin',
      'readiness_status',
      'follow_up_tasks',
    ],
    rows: rows.map((row) => {
      const issues = getLti13UinConfigurationIssues(row);
      if (row.active_lti13_instances_without_uin_count > 0) {
        issues.push(
          `${row.active_lti13_instances_without_uin_count} active LTI 1.3 instance(s) need a UIN attribute`,
        );
      }
      if (row.users_without_uin_count > 0) {
        issues.push(`${row.users_without_uin_count} existing user record(s) need a UIN backfill`);
      }
      return {
        institution_id: row.institution_id,
        institution: `${row.institution_short_name}: ${row.institution_long_name}`,
        lti13_instance_id: row.lti13_instance_id,
        lti13_instance: row.lti13_instance_name,
        platform: row.platform,
        lti13_uin_attribute: row.lti13_uin_attribute,
        saml_uin_attribute: row.saml_uin_attribute,
        enabled_institutional_authn_providers: row.enabled_authn_provider_names
          .filter(isInstitutionalAuthenticationProvider)
          .join(', '),
        users_without_uin: row.users_without_uin_count,
        readiness_status: issues.length > 0 ? 'follow-up required' : 'automated checks passed',
        follow_up_tasks: issues.join('\n'),
      };
    }),
  };
}
