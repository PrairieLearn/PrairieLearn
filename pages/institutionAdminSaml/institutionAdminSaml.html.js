const { html } = require('@prairielearn/html');
const { renderEjs } = require('@prairielearn/html-ejs');

const InstitutionAdminSaml = ({ samlProvider, resLocals }) => {
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
          <form method="POST">
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

            <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
            <button type="submit" class="btn btn-primary">Save</button>
          </form>
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
