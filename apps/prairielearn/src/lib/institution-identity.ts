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
  has_configured_lti13_uin: z.boolean(),
});

export type InstitutionIdentityConfigurationStatus = z.infer<
  typeof InstitutionIdentityConfigurationStatusSchema
>;
type Lti13UinPrerequisites = Pick<
  InstitutionIdentityConfigurationStatus,
  'saml_uin_attribute' | 'enabled_authn_provider_names'
>;

export const LTI13_UIN_COMPATIBILITY_CONFIRMATION_FIELDS = {
  sameCanonicalUin: 'lti13_uin_same_canonical_uin_confirmed',
  usersBackfilled: 'lti13_uin_users_backfilled_confirmed',
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

export function getLti13UinConfigurationIssues(status: Lti13UinPrerequisites): string[] {
  const issues: string[] = [];

  if (!hasSamlAsSoleInstitutionalAuthenticationProvider(status.enabled_authn_provider_names)) {
    issues.push('SAML must be the sole enabled institutional authentication provider');
  }
  if (!status.saml_uin_attribute) {
    issues.push('SAML must have a UIN attribute configured');
  }

  return issues;
}

export function assertLti13UinCompatibilityConfirmed(body: Record<string, unknown>): void {
  const missingConfirmations = Object.values(LTI13_UIN_COMPATIBILITY_CONFIRMATION_FIELDS).filter(
    (field) => body[field] !== '1',
  );

  if (missingConfirmations.length > 0) {
    throw new HttpStatusError(
      400,
      'All LTI/SAML UIN compatibility confirmations are required for this change',
    );
  }
}

/**
 * Guards changes that introduce or alter an LTI UIN identity mapping. Configuration prerequisites
 * can be checked automatically, but canonical-UIN compatibility and user backfilling require the
 * operator confirmations carried in the request body.
 */
export async function assertLti13UinConfigurationAllowed(
  institution_id: string,
  body: Record<string, unknown>,
): Promise<void> {
  const issues = getLti13UinConfigurationIssues(
    await selectInstitutionIdentityConfigurationStatus(institution_id),
  );
  if (issues.length > 0) throw new HttpStatusError(400, issues.join('; '));
  assertLti13UinCompatibilityConfirmed(body);
}
