import { html } from '@prairielearn/html';

import { PageLayout } from '../../../components/PageLayout.js';
import { type Lti13Instance } from '../../../lib/db-types.js';

export function Lti13Test({
  resLocals,
  lti13_claims,
  userInfo,
  lti13_instance,
  url,
}: {
  resLocals: Record<string, any>;
  lti13_claims: Record<string, any>;
  userInfo: {
    uin: string | null;
    uid: string | null;
    name: string | null;
    email: string | null;
  };
  lti13_instance: Lti13Instance;
  url: URL;
}) {
  return PageLayout({
    resLocals,
    pageTitle: 'LTI 1.3 test',
    navContext: { type: 'public', page: 'lti13_auth' },
    options: {
      enableNavbar: false,
      enableEnhancedNav: false,
    },
    content: html`
      <h1>LTI 1.3 authentication testing</h1>
      <p>
        Once you're satisfied, remove <code>?test</code> from the end of your configured
        <a href="${url.href}">OpenID Connection Initiation URL</a>
        to bypass this debugging report and continue to authentication.
      </p>
      <h2>Mapped LTI 1.3 claims</h2>
      <p>The user would be authenticated as:</p>
      <ul>
        <li><b>UID:</b> ${userInfo.uid} (<code>${lti13_instance.uid_attribute}</code>)</li>
        <li><b>UIN:</b> ${userInfo.uin} (<code>${lti13_instance.uin_attribute}</code>)</li>
        <li><b>Name:</b> ${userInfo.name} (<code>${lti13_instance.name_attribute}</code>)</li>
        <li><b>Email:</b> ${userInfo.email} (<code>${lti13_instance.email_attribute}</code>)</li>
      </ul>
      <h2>All LTI 1.3 claims</h2>
      <pre><code>${JSON.stringify(lti13_claims, null, 2)}</code></pre>
    `,
  });
}

export function Lti13AuthIframe({ parameters }: { parameters: Record<string, any> }) {
  return PageLayout({
    resLocals: {},
    pageTitle: 'LTI 1.3 redirect',
    navContext: { type: 'public', page: 'lti13_auth' },
    options: {
      enableNavbar: false,
      paddingBottom: false,
      paddingSides: false,
      enableEnhancedNav: false,
    },
    content: html`
      <div class="m-3">
        <form id="interceptForm" method="POST" action="" target="_blank">
          ${Object.entries(parameters).map(
            ([key, value]) => html`<input type="hidden" name="${key}" value="${String(value)}" />`,
          )}
          <button id="submitButton" class="btn btn-primary mb-2">
            Open PrairieLearn in a new window
          </button>
        </form>
        <div id="message">If there are login errors, reload this page to start again.</div>

        <script>
          const form = document.getElementById('interceptForm');
          const button = document.getElementById('submitButton');
          const messageDiv = document.getElementById('message');

          form.addEventListener('submit', function () {
            button.disabled = true;
            button.textContent = 'Opened PrairieLearn in a new window';
            messageDiv.textContent = 'Reload this page to access PrairieLearn again.';
          });
        </script>
      </div>
    `,
  });
}

export function Lti13AuthRequired({
  institution_id,
  resLocals,
}: {
  institution_id: string;
  resLocals: Record<string, any>;
}) {
  return PageLayout({
    resLocals,
    pageTitle: 'LTI 1.3 authentication required',
    navContext: { type: 'public', page: 'lti13_auth' },
    options: {
      enableNavbar: false,
      enableEnhancedNav: false,
    },
    content: html`
      <h1>Authentication required</h1>
      <p>
        Your institution requires you to authenticate via an additional method to complete the login
        process.
      </p>
      <a href="/pl/login?institution_id=${institution_id}">Log in</a>
    `,
  });
}
