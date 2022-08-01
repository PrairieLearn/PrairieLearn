const { html } = require('@prairielearn/html');
const { renderEjs } = require('@prairielearn/html-ejs');

const InstitutionAdminSaml = ({ institution, samlProvider, resLocals }) => {
  const hasSamlProvider = !!samlProvider;

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
              <label for="sso_login_url">SSO Login URL</label>
              <input
                type="text"
                class="form-control js-disable-unchecked"
                name="sso_login_url"
                id="sso_login_url"
                value="${samlProvider?.sso_login_url ?? ''}"
                ${hasSamlProvider ? '' : 'disabled'}
              />
            </div>

            <div class="form-group">
              <label for="issuer">Issuer</label>
              <input
                type="text"
                class="form-control js-disable-unchecked"
                name="issuer"
                id="issuer"
                value="${samlProvider?.issuer ?? ''}"
                ${hasSamlProvider ? '' : 'disabled'}
              />
            </div>

            <div class="form-group">
              <label for="certificate">Certificate</label>
              <textarea

                class="form-control js-disable-unchecked"
                name="certificate"
                id="certificate"
                ${hasSamlProvider ? '' : 'disabled'}
              >${samlProvider?.certificate ?? ''}</textarea>

            <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
            <button type="submit" class="btn btn-primary">Save</button>
          </form>

          <a
            href="/pl/auth/institution/${institution.id}/saml/login"
            class="btn btn-primary"
            target="_blank"
          >
            Test SAML login
          </a>

          <a href="/pl/auth/institution/${institution.id}/saml/metadata" target="_blank">
            View SAML metadata
          </a>
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
