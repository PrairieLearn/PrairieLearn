const { html } = require('@prairielearn/html');
const { renderEjs } = require('@prairielearn/html-ejs');

const InstitutionAdminSaml = ({ institution, samlProvider, host, resLocals }) => {
  const hasSamlProvider = !!samlProvider;

  const issuer = `https://${host}/saml/institution/${institution.id}`;
  const metadataUrl = `https://${host}/pl/auth/institution/${institution.id}/saml/metadata`;
  const assertionConsumerServiceUrl = `https://${host}/pl/auth/institution/${institution.id}/saml/callback`;

  return html`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        ${renderEjs(__filename, "<%- include('../partials/head')%>", resLocals)}
      </head>
      <body>
        ${renderEjs(__filename, "<%- include('../partials/navbar') %>", {
          ...resLocals,
          navbarType: 'institution',
          navPage: 'institution_admin',
          navSubPage: 'saml',
        })}
        <div class="container">
          ${hasSamlProvider
            ? html`
                <div class="card mb-4">
                  <div class="card-header bg-primary text-white d-flex align-items-center">
                    Information required by your Identity Provider
                  </div>
                  <div class="card-body">
                    <p>
                      If your Identity Provider supports obtaining Service Provider configuration
                      from a metadata URL, use the following:
                    </p>
                    <small class="text-muted">Metadata URL</small>
                    <div class="form-control mb-3">${metadataUrl}</div>
                    <p>Otherwise, use the following values to configure your Identity Provider:</p>
                    <small class="text-muted">Issuer / Entity ID</small>
                    <div class="form-control mb-3">${issuer}</div>
                    <small class="text-muted">Assertion Consumer Service URL</small>
                    <div class="form-control mb-3">${assertionConsumerServiceUrl}</div>
                    <small class="text-muted">Public Key</small>
                    <pre
                      class="form-control mb-0"
                      style="height: auto;"
                    ><code>${samlProvider.public_key}</code></pre>
                  </div>
                </div>
              `
            : ''}
          <h2>Identity Provider configuration</h2>
          <form method="POST" class="mb-3">
            <div class="form-check mb-3">
              <input
                type="checkbox"
                class="form-check-input"
                name="saml_enabled"
                id="saml_enabled"
                value="1"
                ${hasSamlProvider ? 'checked' : ''}
              />
              <label class="form-check-label" for="saml_enabled">
                Enable SAML authentication
              </label>
            </div>

            <div class="form-group">
              <label for="issuer">Issuer / Entity ID</label>
              <input
                type="text"
                class="form-control js-disable-unchecked"
                name="issuer"
                id="issuer"
                value="${samlProvider?.issuer ?? ''}"
                describedBy="issuer-help"
                ${hasSamlProvider ? '' : 'disabled'}
              />
              <small id="issuerHelp" class="form-text text-muted">
                Typically a unique URL generated by your Identity Provider.
              </small>
            </div>

            <div class="form-group">
              <label for="sso_login_url">SSO Login URL</label>
              <input
                type="text"
                class="form-control js-disable-unchecked"
                name="sso_login_url"
                id="sso_login_url"
                value="${samlProvider?.sso_login_url ?? ''}"
                ${hasSamlProvider ? '' : 'disabled'}
              />
              <small id="ssoLoginUrlHelp" class="form-text text-muted">
                The SAML endpoint URL generated by your Identity Provider.
              </small>
            </div>

            <div class="form-group">
              <label for="certificate">Public Certificate</label>
              <textarea
                class="form-control js-disable-unchecked"
                name="certificate"
                id="certificate"
                rows="20"
                ${hasSamlProvider ? '' : 'disabled'}
              >
${samlProvider?.certificate ?? ''}</textarea
              >
            </div>

            <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
            <button type="submit" class="btn btn-primary">Save</button>
          </form>

          ${hasSamlProvider
            ? html`
                <p>
                  <a
                    href="/pl/auth/institution/${institution.id}/saml/login?RelayState=test"
                    target="_blank"
                  >
                    Test SAML login
                  </a>
                </p>

                <p>
                  <a href="${metadataUrl}" target="_blank"> View SAML metadata </a>
                </p>
              `
            : ''}
        </div>
        <script>
          (() => {
            // Disable the inputs when the checkbox is unchecked.
            const enabledCheckbox = document.querySelector('#saml_enabled');
            enabledCheckbox.addEventListener('change', (e) => {
              document.querySelectorAll('.js-disable-unchecked').forEach((el) => {
                el.disabled = !e.target.checked;
              });
            });
          })();
        </script>
      </body>
    </html>
  `.toString();
};

module.exports.InstitutionAdminSaml = InstitutionAdminSaml;
