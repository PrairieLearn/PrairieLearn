import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';
import { loadSqlEquiv, queryRow, queryScalars } from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { hasSamlAsSoleInstitutionalAuthenticationProvider } from './authn-provider-classification.js';
import { AuthnProviderSchema } from './db-types.js';

const sql = loadSqlEquiv(import.meta.url);

const AuthnProviderNameSchema = AuthnProviderSchema.shape.name;

/**
 * Institution-wide identity state spanning SAML, LTI, and authentication-provider configuration.
 * This is used to enforce invariants when any one of those configurations changes.
 */
const InstitutionIdentityConfigurationStatusSchema = z.object({
  saml_uin_attribute: z.string().nullable(),
  enabled_authn_provider_names: AuthnProviderNameSchema.array(),
  has_roster_sync_permitted_lti13_instance: z.boolean(),
});

type InstitutionIdentityConfigurationStatus = z.infer<
  typeof InstitutionIdentityConfigurationStatusSchema
>;

export const LTI13_ROSTER_SYNC_CONFIRMATION_FIELDS = {
  sameCanonicalUin: 'lti13_roster_sync_same_canonical_uin_confirmed',
  usersBackfilled: 'lti13_roster_sync_users_backfilled_confirmed',
} as const;

export function normalizeUinAttribute(value: unknown): string | null {
  if (value == null) return null;
  const normalized = z.string().parse(value).trim();
  return normalized || null;
}

/**
 * Serializes identity-configuration changes across the institution's SAML, LTI, and
 * authentication-provider records. This must be called inside the transaction that reads and
 * updates those records.
 */
export async function lockInstitutionForIdentityConfiguration(
  institution_id: string,
): Promise<void> {
  await queryRow(sql.lock_institution, { institution_id }, z.object({ id: IdSchema }));
}

export async function selectInstitutionIdentityConfigurationStatus(
  institution_id: string,
): Promise<InstitutionIdentityConfigurationStatus> {
  return await queryRow(
    sql.select_identity_configuration_status,
    { institution_id },
    InstitutionIdentityConfigurationStatusSchema,
  );
}

export async function selectAuthenticationProviderNames(
  authn_provider_ids: string[],
): Promise<z.infer<typeof AuthnProviderNameSchema>[]> {
  return await queryScalars(
    sql.select_authn_provider_names,
    { authn_provider_ids },
    AuthnProviderNameSchema,
  );
}

export function getLti13RosterSyncPermissionIssues(
  status: InstitutionIdentityConfigurationStatus,
  lti13UinAttribute: string | null,
): string[] {
  const issues: string[] = [];

  if (!normalizeUinAttribute(lti13UinAttribute)) {
    issues.push('LTI 1.3 must have a UIN attribute configured');
  }
  if (!hasSamlAsSoleInstitutionalAuthenticationProvider(status.enabled_authn_provider_names)) {
    issues.push('SAML must be the sole enabled institutional authentication provider');
  }
  if (!status.saml_uin_attribute) {
    issues.push('SAML must have a UIN attribute configured');
  }

  return issues;
}

/**
 * Roster syncing can create or match users using identity data from two independent systems. The
 * operator must confirm the compatibility checks that PrairieLearn cannot verify automatically.
 */
export async function assertLti13RosterSyncCanBePermitted(
  institution_id: string,
  lti13UinAttribute: string | null,
  body: Record<string, unknown>,
): Promise<void> {
  const issues = getLti13RosterSyncPermissionIssues(
    await selectInstitutionIdentityConfigurationStatus(institution_id),
    lti13UinAttribute,
  );
  if (issues.length > 0) throw new HttpStatusError(400, issues.join('; '));
  if (Object.values(LTI13_ROSTER_SYNC_CONFIRMATION_FIELDS).some((field) => body[field] !== '1')) {
    throw new HttpStatusError(400, 'Both roster syncing confirmations are required');
  }
}
