import { html } from '@prairielearn/html';

import { HeadContents } from '../../../components/HeadContents.html.js';
import { LoadUserAuth } from '../../../lib/authn.js';
import { Lti13Instance } from '../../../lib/db-types.js';

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
        ${HeadContents({ resLocals, pageTitle: 'LTI 1.3 test' })}
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
            <li><b>Email:</b> ${userInfo.email} (<code>${lti13_instance.email_attribute}</code>)
          </ul>
          <h2>All LTI 1.3 claims</h1>
          <pre><code>${JSON.stringify(lti13_claims, null, 2)}</code></pre>
        </main>
      </body>
    </html>
  `.toString();
};

export const Lti13Iframe = ({
  resLocals,
  target_url,
}: {
  resLocals: Record<string, any>;
  target_url: string;
}) => {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${HeadContents({ resLocals, pageTitle: 'LTI 1.3 redirect' })}
        <script>
          window.parent.postMessage(
            {
              subject: 'lti.frameResize',
              height: 100,
            },
            '*',
          );
        </script>
      </head>
      <body>
        <nav class="navbar navbar-dark bg-dark navbar-expand-md" aria-label="Global navigation">
          <div class="container-fluid">
            <a
              class="navbar-brand"
              href="${resLocals.homeUrl}"
              target="_blank"
              aria-label="Homepage"
            >
              <span class="navbar-brand-label">PrairieLearn</span>
              <span class="navbar-brand-hover-label">
                Go home <i class="fa fa-angle-right" aria-hidden="true"></i>
              </span>
            </a>
            <button
              class="navbar-toggler"
              type="button"
              data-toggle="collapse"
              data-target=".navbar-collapse"
              aria-expanded="false"
              aria-label="Toggle navigation"
            >
              <span class="navbar-toggler-icon"></span>
            </button>
            <span class="navbar-text">${resLocals.authn_user.name}</span>
          </div>
        </nav>

        <main>
          <a class="btn btn-primary btn-lg m-3" href="${target_url}" target="_blank"
            >Open PrairieLearn in a new window</a
          >
        </main>
      </body>
    </html>
  `.toString();
};
