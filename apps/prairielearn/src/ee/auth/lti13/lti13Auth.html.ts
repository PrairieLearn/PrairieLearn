import { html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';
import { Lti13Instance } from '../../../lib/db-types';
import { LoadUserAuth } from '../../../lib/authn';

export const Lti13Test = ({
  resLocals,
  lti13_claims,
  userInfo,
  lti13_instance,
  url,
}: {
  resLocals: Record<string, any>;
  lti13_claims: Record<string, any>;
  userInfo: LoadUserAuth;
  lti13_instance: Lti13Instance;
  url: URL;
}) => {
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
          <p>
            Once you're satisfied, remove <code>?test</code> from the end of your configured
            <a href="${url.href}">OpenID Connection Initiation URL</a>
            to bypass this debugging report and continue to authentication.
          </p>
          <h2>Mapped LTI 1.3 claims</h2>
          <p>The user would be authenticated as:</p>
          <ul>
            <li><b>UID:</b> ${userInfo.uid} (<code>${lti13_instance.uid_attribute}</code>)
            <li><b>UIN:</b> ${userInfo.uin} (<code>${lti13_instance.uin_attribute}</code>)
            <li><b>Name:</b> ${userInfo.name} (<code>${lti13_instance.name_attribute}</code>)
          </ul>
          <h2>All LTI 1.3 claims</h1>
          <pre><code>${JSON.stringify(lti13_claims, null, 2)}</code></pre>
        </main>
      </body>
    </html>
  `.toString();
};
