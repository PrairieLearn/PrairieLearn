// @ts-check
const { html } = require('@prairielearn/html');
const { renderEjs } = require('@prairielearn/html-ejs');

const InstitutionAdminSso = ({
  institution,
  supportedAuthenticationProviders,
  institutionSamlProvider,
  institutionAuthenticationProviders,
  resLocals,
}) => {
  const hasSamlProvider = !!institutionSamlProvider;
  // TODO: only show authentication providers that were enabled in `config.json`.
  return html`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        ${renderEjs(__filename, "<%- include('../../../pages/partials/head')%>", {
          ...resLocals,
          navPage: 'institution_admin',
          pageTitle: 'SSO',
        })}
      </head>
      <body>
        ${renderEjs(__filename, "<%- include('../../../pages/partials/navbar') %>", {
          ...resLocals,
          institution,
          navbarType: 'institution',
          navPage: 'institution_admin',
          navSubPage: 'sso',
        })}

        <div class="container">
          <form method="POST">
            <div class="form-group">
              <div class="h5">Enabled single sign-on providers</div>
              ${supportedAuthenticationProviders.map((provider) => {
                const isEnabled = institutionAuthenticationProviders.some(
                  (p) => p.id === provider.id
                );
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
                              <a href="${resLocals.urlPrefix}/saml">configure SAML</a> before you
                              can enable it.
                            </small>
                          `
                        : ''}
                    </label>
                  </div>
                `;
              })}
            </div>
            <div class="form-group">
              <label class="h5 mb-0" for="defaultProvider">Default single sign-on provider</label>
              <small class="form-text text-muted mt-0 mb-2">
                When a default single sign-on provider is configured, users can click on your
                institution's name on the login screen and be taken directly to the appropriate
                provider. Note that LTI cannot be set as the default provider.
              </small>
              <select
                class="custom-select js-default-authentication-provider"
                id="defaultProvider"
                name="default_authn_provider_id"
              >
                <option
                  value=""
                  ${institution.default_authn_provider_id === null ? 'selected' : ''}
                >
                  None
                </option>
                ${supportedAuthenticationProviders.map((provider) => {
                  if (provider.name === 'LTI') return '';

                  return html`
                    <option
                      value="${provider.id}"
                      ${provider.id === institution.default_authn_provider_id ? 'selected' : ''}
                      ${provider.name === 'SAML' && !hasSamlProvider ? 'disabled' : ''}
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
        </div>

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
      </body>
    </html>
  `.toString();
};

module.exports.InstitutionAdminSso = InstitutionAdminSso;
