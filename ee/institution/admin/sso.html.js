const { html } = require('@prairielearn/html');
const { renderEjs } = require('@prairielearn/html-ejs');

const InstitutionAdminSso = ({ institution, resLocals }) => {
  return html`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        ${renderEjs(__filename, "<%- include('../../../pages/partials/head')%>", resLocals)}
      </head>
      <body>
        ${renderEjs(__filename, "<%- include('../../../pages/partials/navbar') %>", {
          ...resLocals,
          institution,
          navbarType: 'institution',
          navPage: 'institution_admin',
          navSubPage: 'saml',
        })}
      </body>
    </html>
  `.toString();
};

module.exports.InstitutionAdminSso = InstitutionAdminSso;
