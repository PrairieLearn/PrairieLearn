const { html } = require('@prairielearn/html');
const { renderEjs } = require('@prairielearn/html-ejs');


const InstructorSharing =  ({
  resLocals,
}) => {
  return html`
    <!DOCTYPE html>
      <html lang="en">
        <head>
          ${renderEjs(__filename, "<%- include('../../pages/partials/head') %>", resLocals)}
          <style>
            .continue-card-container {
              width: 100%;
              max-width: 400px;
            }
          </style>
        </head>
        <body>
          <script>
              $(function() {
                  $('[data-toggle="popover"]').popover({
                      sanitize: false
                  })
              });
          </script>
        ${renderEjs(__filename, "<%- include('../partials/navbar'); %>", resLocals)}
        <div id="content" class="container-fluid">
        </div>
        <body>
    </html>
  `.toString();

}

module.exports.InstructorSharing = InstructorSharing;
