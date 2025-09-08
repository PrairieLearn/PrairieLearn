import { html } from '@prairielearn/html';

import { PageLayout } from '../../../components/PageLayout.js';
import { type AuthnProvider, type Institution, type SamlProvider } from '../../../lib/db-types.js';

export const AdministratorInstitutionSso = ({
  institution,
  supportedAuthenticationProviders,
  institutionSamlProvider,
  institutionAuthenticationProviders,
  resLocals,
}: {
  institution: Institution;
  supportedAuthenticationProviders: AuthnProvider[];
  institutionSamlProvider: SamlProvider | null;
  institutionAuthenticationProviders: AuthnProvider[];
  resLocals: Record<string, any>;
}) => {
  const hasSamlProvider = !!institutionSamlProvider;

  // TODO: only show authentication providers that were enabled in `config.json`.
  return PageLayout({
    resLocals: { ...resLocals, institution },
    pageTitle: 'SSO - Institution Admin',
    navContext: {
      type: 'administrator_institution',
      page: 'administrator_institution',
      subPage: 'sso',
    },
    content: html`
      <form method="POST">
        <div class="mb-3">
          <h2 class="h4">Enabled single sign-on providers</h2>
          ${institutionAuthenticationProviders.length === 0
            ? html`
                <div class="alert alert-warning" role="alert">
                  No single sign-on providers are currently enabled for this institution. Users will
                  not be able to log in unless at least one provider is enabled.
                </div>
              `
            : ''}
          ${supportedAuthenticationProviders.map((provider) => {
            const isEnabled = institutionAuthenticationProviders.some((p) => p.id === provider.id);
            return html`
              <div class="form-check">
                <input
                  class="form-check-input js-authentication-provider"
                  type="checkbox"
                  value="${provider.id}"
                  id="provider-${provider.id}-enabled"
                  name="enabled_authn_provider_ids"
                  data-provider-id="${provider.id}"
                  ${isEnabled ? 'checked' : ''}
                  ${provider.name === 'SAML' && !hasSamlProvider ? 'disabled' : ''}
                />
                <label class="form-check-label" for="provider-${provider.id}-enabled">
                  ${provider.name}
                  ${provider.name === 'SAML' && !hasSamlProvider
                    ? html`
                        <small class=" d-block text-muted">
                          You must
                          <a href="${resLocals.urlPrefix}/saml">configure SAML</a> before you can
                          enable it.
                        </small>
                      `
                    : ''}
                </label>
              </div>
            `;
          })}
        </div>
        <div class="mb-3">
          <h2 class="h4 mb-0" id="defaultProviderLabel">Default single sign-on provider</h2>
          <small class="form-text text-muted mt-0 mb-2">
            When a default single sign-on provider is configured, users can click on your
            institution's name on the login screen and be taken directly to the appropriate
            provider. Note that LTI and LTI 1.3 cannot be set as the default provider.
          </small>
          <select
            class="form-select js-default-authentication-provider"
            id="defaultProvider"
            name="default_authn_provider_id"
            aria-labelledby="defaultProviderLabel"
          >
            <option value="" ${institution.default_authn_provider_id === null ? 'selected' : ''}>
              None
            </option>
            ${supportedAuthenticationProviders.map((provider) => {
              if (provider.name === 'LTI' || provider.name === 'LTI 1.3') return '';

              const isEnabled = institutionAuthenticationProviders.some(
                (p) => p.id === provider.id,
              );

              return html`
                <option
                  value="${provider.id}"
                  ${provider.id === institution.default_authn_provider_id ? 'selected' : ''}
                  ${!isEnabled ? 'disabled' : ''}
                >
                  ${provider.name}
                </option>
              `;
            })}
          </select>
        </div>
        <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
        <button type="submit" class="btn btn-primary">Save</button>
      </form>
    `,
    postContent: html`
      <script>
        $(function () {
          // Keep default authentication provider selection in sync with checkboxes:
          // - If the default authentication provider is disabled, reset the default to "None".
          // - When a provider is enabled, add it to the list of options.
          // - When a provider is disabled, remove it from the list of options.
          $('.js-authentication-provider').on('change', function (e) {
            var providerId = $(this).attr('data-provider-id');
            var currentDefaultProvider = $('#defaultProvider').val();

            if (currentDefaultProvider === providerId && !e.target.checked) {
              // Reset default provider to "None" if it's being disabled.
              $('#defaultProvider').val('');
            }

            // Sync disabled state of default provider option.
            var defaultProviderOption = $('#defaultProvider option[value="' + providerId + '"]');
            defaultProviderOption.prop('disabled', !e.target.checked);
          });
        });
      </script>
    `,
  });
};
