import { useState } from 'preact/hooks';

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
  urlPrefix,
  csrfToken,
}: {
  institution: StaffInstitution;
  hasSamlProvider: boolean;
  supportedAuthenticationProviders: StaffAuthnProvider[];
  institutionAuthenticationProviders: StaffAuthnProvider[];
  urlPrefix: string;
  csrfToken: string;
}) {
  const [enabledProviderIds, setEnabledProviderIds] = useState(
    () => new Set(institutionAuthenticationProviders.map((p) => p.id)),
  );

  const [defaultProviderId, setDefaultProviderId] = useState(institution.default_authn_provider_id);

  const googleProvider = supportedAuthenticationProviders.find((p) => p.name === 'Google');
  const microsoftProvider = supportedAuthenticationProviders.find((p) => p.name === 'Azure');
  const samlProvider = supportedAuthenticationProviders.find((p) => p.name === 'SAML');

  // A "primary provider" is one of Google, Microsoft, or SAML. These are the ones will
  // actually provision accounts for users. Other providers (e.g. LTI) are secondary
  // and do not provision accounts.
  //
  // Note that LTI 1.3 *does* provision accounts, but we're in the process of changing that,
  // so it's no included here.
  const enabledPrimaryProviders = [...enabledProviderIds]
    .filter((id) => {
      return [googleProvider, microsoftProvider, samlProvider].some((p) => p?.id === id);
    })
    .map((id) => {
      return supportedAuthenticationProviders.find((p) => p.id === id)!;
    });

  return (
    <form method="POST">
      <div class="mb-3">
        <h2 class="h4">Enabled single sign-on providers</h2>
        {supportedAuthenticationProviders.map((provider) => {
          const isEnabled = enabledProviderIds.has(provider.id);
          return (
            <div key={provider.id} class="form-check">
              <input
                class="form-check-input js-authentication-provider"
                type="checkbox"
                value={provider.id}
                id={`provider-${provider.id}-enabled`}
                name="enabled_authn_provider_ids"
                checked={isEnabled}
                disabled={provider.name === 'SAML' && !hasSamlProvider}
                onChange={(e) => {
                  setEnabledProviderIds((prev) => {
                    const newSet = new Set(prev);
                    if (e.currentTarget.checked) {
                      newSet.add(provider.id);
                    } else {
                      newSet.delete(provider.id);
                    }
                    return newSet;
                  });

                  // If the default provider is being disabled, reset to null (none).
                  if (!e.currentTarget.checked && defaultProviderId === provider.id) {
                    setDefaultProviderId(null);
                  }
                }}
              />
              <label class="form-check-label" for={`provider-${provider.id}-enabled`}>
                {provider.name}
                {provider.name === 'SAML' && !hasSamlProvider ? (
                  <small class="d-block">
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
        {enabledPrimaryProviders.length > 1 && (
          <div class="alert alert-warning mt-2" role="alert">
            It is <strong>not recommended</strong> to enable{' '}
            {formatProviderList(enabledPrimaryProviders)} at the same time. It may be appropriate in
            situations where students use one sign-on provider and staff use a different one.
            Contact a technical administrator if you have questions.
          </div>
        )}
        {enabledProviderIds.size === 0 && (
          <div class="alert alert-warning mt-2" role="alert">
            No single sign-on providers are currently enabled for this institution. Users will not
            be able to log in unless at least one provider is enabled.
          </div>
        )}
      </div>
      <div class="mb-3">
        <h2 class="h4" id="defaultProviderLabel">
          Default single sign-on provider
        </h2>
        <select
          class="form-select js-default-authentication-provider"
          id="defaultProvider"
          name="default_authn_provider_id"
          aria-labelledby="defaultProviderLabel"
          value={defaultProviderId || ''}
          onChange={(e) => setDefaultProviderId(e.currentTarget.value || null)}
        >
          <option value="" selected={institution.default_authn_provider_id === null}>
            None
          </option>
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
        <div class="form-text">
          When a default single sign-on provider is configured, users can click on your
          institution's name on the login screen and be taken directly to the appropriate provider.
          Note that LTI and LTI 1.3 cannot be set as the default provider.
        </div>
      </div>
      <input type="hidden" name="__csrf_token" value={csrfToken} />
      <button type="submit" class="btn btn-primary">
        Save
      </button>
    </form>
  );
}

AdministratorInstitutionSsoForm.displayName = 'AdministratorInstitutionSsoForm';
