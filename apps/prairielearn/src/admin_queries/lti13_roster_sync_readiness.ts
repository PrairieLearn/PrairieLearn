import { z } from 'zod';

import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { AuthnProviderSchema } from '../lib/db-types.js';

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
  enabled_authn_provider_names: AuthnProviderSchema.shape.name.array(),
  active_lti13_instances_without_uin_count: z.coerce.number(),
  users_without_uin_count: z.coerce.number(),
  google_subject_candidate_count: z.coerce.number(),
  uin_category_counts: z.record(z.string(), z.coerce.number()),
});

export const specs: AdministratorQuerySpecs = {
  description:
    'Inventory active LTI 1.3 instances, institution identity prerequisites, and UIN backfill gaps before roster-sync rollout.',
  resultFormats: { uin_format_categories: 'pre', follow_up_tasks: 'pre' },
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
      'uin_format_categories',
      'readiness_status',
      'follow_up_tasks',
    ],
    rows: rows.map((row) => {
      const enabledInstitutionalAuthnProviderNames = row.enabled_authn_provider_names.filter(
        (name) => name !== 'LTI' && name !== 'LTI 1.3',
      );
      const issues: string[] = [];

      if (
        enabledInstitutionalAuthnProviderNames.length !== 1 ||
        enabledInstitutionalAuthnProviderNames[0] !== 'SAML'
      ) {
        issues.push('SAML must be the sole enabled institutional authentication provider');
      }
      if (!row.saml_uin_attribute) {
        issues.push('SAML must have a UIN attribute configured');
      }
      if (row.active_lti13_instances_without_uin_count > 0) {
        issues.push(
          `${row.active_lti13_instances_without_uin_count} active LTI 1.3 instance(s) need a UIN attribute`,
        );
      }
      if (row.users_without_uin_count > 0) {
        issues.push(`${row.users_without_uin_count} existing user record(s) need a UIN backfill`);
      }
      if (row.google_subject_candidate_count > 0) {
        issues.push(
          `${row.google_subject_candidate_count} existing UIN(s) are 21-digit decimal Google subject candidates; reconcile them with the canonical SAML UIN`,
        );
      }
      const uinCategoryCounts = Object.entries(row.uin_category_counts).sort(
        ([categoryA, countA], [categoryB, countB]) =>
          countB - countA || categoryA.localeCompare(categoryB),
      );
      // Format categories are heuristic provenance signals, not validation rules. For example,
      // an institution may intentionally use GUID-shaped SAML UINs; a second populated category
      // is the useful warning that legacy identities may still be present.
      if (uinCategoryCounts.length > 1) {
        issues.push(
          `Existing UINs span ${uinCategoryCounts.length} format categories; confirm which format is canonical and reconcile the others`,
        );
      }
      const needsManualReview = issues.length === 0;
      const followUpTasks = [
        ...issues,
        'Confirm that the configured SAML and LTI attributes represent the same canonical UIN',
        'Confirm that existing user UIN values are compatible with both providers',
        'Confirm that every in-scope roster member has a usable UIN',
      ];

      return {
        institution_id: row.institution_id,
        institution: `${row.institution_short_name}: ${row.institution_long_name}`,
        lti13_instance_id: row.lti13_instance_id,
        lti13_instance: row.lti13_instance_name,
        platform: row.platform,
        lti13_uin_attribute: row.lti13_uin_attribute,
        saml_uin_attribute: row.saml_uin_attribute,
        enabled_institutional_authn_providers: enabledInstitutionalAuthnProviderNames
          .map((name) => name ?? '(unknown)')
          .join(', '),
        users_without_uin: row.users_without_uin_count,
        uin_format_categories:
          uinCategoryCounts.length > 0
            ? uinCategoryCounts
                .map(([category, count]) => `${category}: ${count.toLocaleString('en-US')}`)
                .join('\n')
            : '(none)',
        readiness_status: needsManualReview ? 'manual review required' : 'follow-up required',
        follow_up_tasks: followUpTasks.join('\n'),
      };
    }),
  };
}
