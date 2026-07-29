import { useState } from 'react';

import { isInstitutionalAuthenticationProvider } from '../../../../lib/authn-provider-classification.js';
import type { StaffAuthnProvider, StaffInstitution } from '../../../../lib/client/safe-db-types.js';
import type { AuthnProvider } from '../../../../lib/db-types.js';

function formatProviderList(providers: AuthnProvider[]) {
  if (providers.length === 2) {
    return `${providers[0].name} and ${providers[1].name}`;
  }
  if (providers.length > 2) {
    return (
      providers
        .slice(0, -1)
        .map((p) => p.name)
        .join(', ') + `, and ${providers[providers.length - 1].name}`
    );
  }
}

export function AdministratorInstitutionSsoForm({
  institution,
  hasSamlProvider,
  supportedAuthenticationProviders,
  institutionAuthenticationProviders,
  hasRosterSyncPermitted,
  urlPrefix,
  csrfToken,
}: {
  institution: StaffInstitution;
  hasSamlProvider: boolean;
  supportedAuthenticationProviders: StaffAuthnProvider[];
  institutionAuthenticationProviders: StaffAuthnProvider[];
  hasRosterSyncPermitted: boolean;
  urlPrefix: string;
  csrfToken: string;
}) {
  const [enabledProviderIds, setEnabledProviderIds] = useState(
    () => new Set(institutionAuthenticationProviders.map((p) => p.id)),
  );

  const [defaultProviderId, setDefaultProviderId] = useState(institution.default_authn_provider_id);

  // LTI sessions must start in an LMS, so LTI providers do not count as institutional sign-on
  // providers for this guardrail.
  const enabledInstitutionalProviders = supportedAuthenticationProviders.filter(
    (provider) =>
      enabledProviderIds.has(provider.id) && isInstitutionalAuthenticationProvider(provider.name),
  );

  return (
    <form method="POST">
      <div className="mb-3">
        <h2 className="h4">Enabled single sign-on providers</h2>
        {hasRosterSyncPermitted && (
          <div className="alert alert-info" role="alert">
            Roster syncing is permitted for an LTI 1.3 instance. SAML must remain the only enabled
            institutional sign-on provider. LTI and LTI 1.3 may remain enabled because those
            sessions begin in a Learning Management System (LMS). Disable roster syncing permission
            for all affected LTI 1.3 instances before changing these settings.
          </div>
        )}
        {supportedAuthenticationProviders.map((provider) => {
          const isEnabled = enabledProviderIds.has(provider.id);
          const isInstitutionalProvider = isInstitutionalAuthenticationProvider(provider.name);
          const isLockedEnabledSaml =
            hasRosterSyncPermitted && provider.name === 'SAML' && isEnabled;
          const isLockedDisabledProvider =
            hasRosterSyncPermitted &&
            isInstitutionalProvider &&
            provider.name !== 'SAML' &&
            !isEnabled;
          const isDisabled =
            (provider.name === 'SAML' && !hasSamlProvider) ||
            isLockedEnabledSaml ||
            isLockedDisabledProvider;
          return (
            <div key={provider.id} className="form-check">
              {isLockedEnabledSaml && (
                <input type="hidden" name="enabled_authn_provider_ids" value={provider.id} />
              )}
              <input
                className="form-check-input js-authentication-provider"
                type="checkbox"
                value={provider.id}
                id={`provider-${provider.id}-enabled`}
                name="enabled_authn_provider_ids"
                checked={isEnabled}
                disabled={isDisabled}
                onChange={({ currentTarget }) => {
                  setEnabledProviderIds((prev) => {
                    const newSet = new Set(prev);
                    if (currentTarget.checked) {
                      newSet.add(provider.id);
                    } else {
                      newSet.delete(provider.id);
                    }
                    return newSet;
                  });

                  // If the default provider is being disabled, reset to null (none).
                  if (!currentTarget.checked && defaultProviderId === provider.id) {
                    setDefaultProviderId(null);
                  }
                }}
              />
              <label className="form-check-label" htmlFor={`provider-${provider.id}-enabled`}>
                {provider.name}
                {provider.name === 'SAML' && !hasSamlProvider ? (
                  <small className="d-block">
                    You must <a href={`${urlPrefix}/saml`}>configure SAML</a> before you can enable
                    it.
                  </small>
                ) : (
                  ''
                )}
              </label>
            </div>
          );
        })}
        {enabledInstitutionalProviders.length > 1 && (
          <div className="alert alert-warning mt-2" role="alert">
            It is <strong>not recommended</strong> to enable{' '}
            {formatProviderList(enabledInstitutionalProviders)} at the same time. It may be
            appropriate in situations where students use one sign-on provider and staff use a
            different one, or while transitioning from one provider to another. Contact a technical
            administrator if you have questions.
          </div>
        )}
        {enabledProviderIds.size === 0 && (
          <div className="alert alert-warning mt-2" role="alert">
            No single sign-on providers are currently enabled for this institution. Users will not
            be able to log in unless at least one provider is enabled.
          </div>
        )}
      </div>
      <div className="mb-3">
        <h2 className="h4" id="defaultProviderLabel">
          Default single sign-on provider
        </h2>
        <select
          className="form-select js-default-authentication-provider"
          id="defaultProvider"
          name="default_authn_provider_id"
          aria-labelledby="defaultProviderLabel"
          value={defaultProviderId || ''}
          onChange={(e) => setDefaultProviderId(e.currentTarget.value || null)}
        >
          <option value="">None</option>
          {supportedAuthenticationProviders.map((provider) => {
            if (provider.name === 'LTI' || provider.name === 'LTI 1.3') return null;

            return (
              <option
                key={provider.id}
                value={provider.id}
                disabled={!enabledProviderIds.has(provider.id)}
              >
                {provider.name}
              </option>
            );
          })}
        </select>
        <div className="form-text">
          When a default single sign-on provider is configured, users can click on your
          institution's name on the login screen and be taken directly to the appropriate provider.
          Note that LTI and LTI 1.3 cannot be set as the default provider.
        </div>
      </div>
      <input type="hidden" name="__csrf_token" value={csrfToken} />
      <button type="submit" className="btn btn-primary">
        Save
      </button>
    </form>
  );
}

AdministratorInstitutionSsoForm.displayName = 'AdministratorInstitutionSsoForm';
