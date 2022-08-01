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
            <div class="form-check">
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
            <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
            <button type="submit" class="btn btn-primary">Save</button>
          </form>
        </div>
        <script>
          (() => {
            // Show the SAML configuration button when the form is clicked.
            const configureSamlButton = document.querySelector('.js-configure-saml-button');
            const configureSamlForm = document.querySelector('.js-configure-saml-form');
            console.log(configureSamlButton, configureSamlForm);
            if (configureSamlButton) {
              configureSamlButton.addEventListener('click', () => {
                configureSamlForm.style.display = 'block';
              });
            }
          })();
        </script>
      </body>
    </html>
  `.toString();
};

module.exports.InstitutionAdminSaml = InstitutionAdminSaml;
