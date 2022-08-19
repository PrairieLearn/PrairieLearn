const { html } = require('@prairielearn/html');
const { renderEjs } = require('@prairielearn/html-ejs');

function AuthNotAllowed({ institutionAuthnProviders, resLocals }) {
  console.log(institutionAuthnProviders);
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
          <p>The authentication method you tried to use is not supported by your institution.</p>
        </div>
      </body>
    </html>
  `.toString();
}

module.exports.AuthNotAllowed = AuthNotAllowed;
