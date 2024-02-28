import { html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';

export function Terms({ resLocals }: { resLocals: Record<string, any> }) {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${renderEjs(__filename, "<%- include('../../../pages/partials/head')%>", {
          ...resLocals,
          navPage: 'institution_admin',
          pageTitle: 'SSO',
        })}
      </head>
      <body>
        ${renderEjs(__filename, "<%- include('../../../pages/partials/navbar') %>", {
          ...resLocals,
          navbarType: 'plain',
        })}
        <main class="container">
          <h1>Terms and Conditions</h1>
          <p>
            To continue, please accept the
            <a href="https://www.prairielearn.com/legal/terms">Terms of Service</a> and
            <a href="https://www.prairielearn.com/legal/privacy">Privacy Policy</a>.
          </p>
          <form method="POST">
            <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
            <button type="submit" class="btn btn-primary" name="__action" value="accept_terms">
              Accept and continue
            </button>
          </form>
        </main>
      </body>
    </html>
  `.toString();
}
