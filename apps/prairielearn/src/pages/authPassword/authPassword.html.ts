import { html } from '@prairielearn/html';

import { PageLayout } from '../../components/PageLayout.js';
import type { UntypedResLocals } from '../../lib/res-locals.types.js';

export function AuthPassword({
  resLocals,
  passwordInvalid,
}: {
  resLocals: UntypedResLocals;
  passwordInvalid: boolean;
}) {
  return PageLayout({
    resLocals,
    pageTitle: 'Password',
    navContext: {
      type: 'plain',
      page: 'password',
    },
    content: html`
      <h1 class="visually-hidden">Assessment Password</h1>
      <div class="card mb-4">
        <div class="card-body">
          <p class="text-center">A password is required to access this assessment.</p>

          ${passwordInvalid
            ? html`
                <p class="text-center text-danger">
                  Previous password invalid or expired. Please try again.
                </p>
              `
            : ''}

          <form method="POST">
            <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
            <div class="mb-3">
              <label class="form-label" for="password">Password</label>
              <input type="password" class="form-control" id="password" name="password" />
            </div>
            <button type="submit" class="btn btn-primary">Submit</button>
          </form>
        </div>
      </div>
    `,
  });
}
