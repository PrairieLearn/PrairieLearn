import { html } from '@prairielearn/html';

import { PageLayout } from '../../../components/PageLayout.js';
import { type User } from '../../../lib/db-types.js';
import type { UntypedResLocals } from '../../../lib/res-locals.js';

export function Terms({ user, resLocals }: { user: User; resLocals: UntypedResLocals }) {
  return PageLayout({
    resLocals,
    pageTitle: 'Terms and conditions',
    navContext: {
      type: 'plain',
      page: 'home',
    },
    content: html`
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
              <button type="submit" class="btn btn-primary" name="__action" value="accept_terms">
                Accept and continue
              </button>
            </form>
          `}
    `,
  });
}
