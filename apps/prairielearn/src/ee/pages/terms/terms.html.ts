import { html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';

import { User } from '../../../lib/db-types.js';

export function Terms({ user, resLocals }: { user: User; resLocals: Record<string, any> }) {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${renderEjs(import.meta.url, "<%- include('../../../pages/partials/head')%>", {
          ...resLocals,
          pageTitle: 'Terms and conditions',
        })}
      </head>
      <body>
        ${renderEjs(import.meta.url, "<%- include('../../../pages/partials/navbar') %>", {
          ...resLocals,
          navPage: 'plain',
          navbarType: 'plain',
        })}
        <main class="container">
          <h1>Terms and Conditions</h1>
          ${user.terms_accepted_at
            ? html`
                <p>
                  You have already accepted the latest
                  <a href="https://www.prairielearn.com/legal/terms">Terms of Service</a> and
                  <a href="https://www.prairielearn.com/legal/privacy">Privacy Policy</a>.
                </p>
                <a href="/" class="btn btn-primary">Continue to PrairieLearn</a>
              `
            : html`
                <p>
                  To continue, please accept the latest
                  <a href="https://www.prairielearn.com/legal/terms">Terms of Service</a> and
                  <a href="https://www.prairielearn.com/legal/privacy">Privacy Policy</a>.
                </p>
                <form method="POST">
                  <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
                  <button
                    type="submit"
                    class="btn btn-primary"
                    name="__action"
                    value="accept_terms"
                  >
                    Accept and continue
                  </button>
                </form>
              `}
        </main>
      </body>
    </html>
  `.toString();
}
