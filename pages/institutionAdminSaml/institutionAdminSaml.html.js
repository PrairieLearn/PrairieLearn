const { html } = require('@prairielearn/html');
const { renderEjs } = require('@prairielearn/html-ejs');

const InstitutionAdminSaml = ({ resLocals }) => {
  return html`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        ${renderEjs(__filename, "<%- include('../partials/head')%>", resLocals)}
      </head>
      <body>
        ${renderEjs(__filename, "<%- include('../partials/navbar') %>", {
          ...resLocals,
          navSubPage: 'saml',
        })}
        <div class="container">
          <h1>Hello, world!</h1>
        </div>
      </body>
    </html>
  `.toString();
};

module.exports.InstitutionAdminSaml = InstitutionAdminSaml;
