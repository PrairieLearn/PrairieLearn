import { html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';

export const Lti13Test = ({ resLocals, lti13_claims, userInfo }) => {
  return html`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        ${renderEjs(__filename, "<%- include('../../../pages/partials/head')%>", {
          ...resLocals,
          pageTitle: 'LTI 1.3 test',
        })}
      </head>
      <body>
        <main class="container mb-4">
          <h1>LTI 1.3 authentication testing</h1>
          <p>If you got this far without an error and were not in testing mode, you would be authenticated with the following data:
          </p>
          <pre><code>${JSON.stringify(userInfo, null, 2)}</code></pre>

          <p>Once you're satisfied, remove <code>?RelayState=test</code> from your <tt>...auth/login</tt> OpenID Connection Initiation Url.
          </p>
          <h2 class="h4">All LTI 1.3 claims</h1>
          <pre><code>${JSON.stringify(lti13_claims, null, 2)}</code></pre>
        </main>
      </body>
    </html>
  `.toString();
};
