const { html } = require('@prairielearn/html');

const AuthPrairieTest = ({ jwt, prairieTestCallback }) => {
  return html`
    <!DOCTYPE html>
    <html lang="en">
      <head> </head>
      <body>
        <form id="form" action="${prairieTestCallback}" method="POST">
          <input type="hidden" name="jwt" value="${jwt}" />
        </form>
        <script>
          // TODO: handle case of disabled JavaScript. That'll probably just
          // look like a "Continue" <button> that submits the form.
          (() => {
            setTimeout(() => {
              function submitForm() {
                const form = document.getElementById('form');
                form.submit();
              }

              if (document.readyState === 'interactive' || document.readyState === 'complete') {
                submitForm();
              } else {
                document.addEventListener('DOMContentLoaded', () => {
                  submitForm();
                });
              }
            }, 0);
          })();
        </script>
      </body>
    </html>
  `.toString();
};

module.exports.AuthPrairieTest = AuthPrairieTest;
