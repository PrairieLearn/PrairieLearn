const { html } = require('@prairielearn/html');
const { renderEjs } = require('@prairielearn/html-ejs');

function AdministratorWorkspaces({ resLocals }) {
  return html`
    <!DOCTYPE html>
    <html>
      <head>
        ${renderEjs(__filename, "<%- include('../partials/head'); %>", resLocals)}
      </head>
      <body>
        <script>
          $(function () {
            $('[data-toggle="popover"]').popover({ sanitize: false });
          });
        </script>
        ${renderEjs(__filename, "<%- include('../partials/navbar'); %>", {
          ...resLocals,
          navPage: 'admin',
          navSubPage: 'workspaces',
        })}
        <div id="content" class="container-fluid"></div>
      </body>
    </html>
  `.toString();
}
