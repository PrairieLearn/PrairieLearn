const { html } = require('@prairielearn/html');
const { renderEjs } = require('@prairielearn/html-ejs');

function getUrlForProvider(provider) {
  switch (provider.name) {
    case 'SAML':
      return `/pl/auth/institution/${provider.institution_id}/saml/login`;
    case 'Google':
      return '/pl/oauth2login';
    case 'Azure':
      return '/pl/azure_login';
    case 'Shibboleth':
      return '/pl/shibcallback';
    default:
      return null;
  }
}

function AuthNotAllowed({ institutionAuthnProviders, resLocals }) {
  console.log(institutionAuthnProviders);

  // LTI providers are special in that we don't currently allow an LTI session
  // to be initiated from PrairieLearn. We'll handle them specially.
  const hasLtiProvider = institutionAuthnProviders.some((p) => p.name === 'LTI');
  const nonLtiAuthnProviders = institutionAuthnProviders.filter((p) => p.name !== 'LTI');
  const hasNonLtiProviders = nonLtiAuthnProviders.length > 0;

  // Check if there's a default authentication provider.
  const defaultAuthnProvider = nonLtiAuthnProviders.find((p) => p.is_default);
  return html`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        ${renderEjs(__filename, "<%- include('../partials/head') %>", resLocals)}
      </head>
      <body>
        ${renderEjs(__filename, "<%- include('../partials/navbar') %>", {
          ...resLocals,
          navbarType: 'unauthenticated',
        })}
        <div class="container">
          <h1>Unsupported authentication method</h1>
          <p>
            The authentication method you tried to use is not supported by your institution.
            ${hasNonLtiProviders ? 'Please use an alternative authentication method.' : ''}
            ${!hasNonLtiProviders && !hasLtiProvider
              ? 'Please contact your institution for more information.'
              : ''}
          </p>
          ${defaultAuthnProvider
            ? html`
                <div class="mb-3">
                  <a href="${getUrlForProvider(defaultAuthnProvider)}" class="btn btn-primary">
                    Sign in with institution single sign-on
                  </a>
                </div>
              `
            : // If there's no default, show all options (except LTI).
              nonLtiAuthnProviders.map(
                (provider) => html`
                  <div class="mb-3">
                    <a href="${getUrlForProvider(provider)}" class="btn btn-primary">
                      Sign in with ${provider.name}
                    </a>
                  </div>
                `
              )}
          ${hasLtiProvider
            ? `You ${
                hasNonLtiProviders ? 'may also be able to' : 'must'
              } start a session from your course's Learning Management System (LMS).`
            : ''}
        </div>
      </body>
    </html>
  `.toString();
}

module.exports.AuthNotAllowed = AuthNotAllowed;
