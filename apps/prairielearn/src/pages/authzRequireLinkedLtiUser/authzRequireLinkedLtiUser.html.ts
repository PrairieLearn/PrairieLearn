import { html } from '@prairielearn/html';

import { PageLayout } from '../../components/PageLayout.html.js';

export function AuthzRequireLinkedLtiUser({
  platformName,
  message,
  resLocals,
}: {
  platformName: string;
  message: string;
  resLocals: Record<string, any>;
}) {
  return PageLayout({
    pageTitle: 'Authentication Required',
    navbarType: 'student',
    resLocals,
    content: html`
      <div class="card mb-4">
        <div class="card-header bg-warning">
          <h3 class="text-center mb-0">Access Required Through ${platformName}</h3>
        </div>
        <div class="card-body">
          <p class="lead text-center">${message}</p>

          <div class="text-center mb-4">
            <i class="fa fa-info-circle fa-3x text-info"></i>
          </div>

          <p class="text-center">
            To continue, please access this course through ${platformName} first. This creates a
            connection between your PrairieLearn account and your ${platformName} account.
          </p>

          <p class="text-center">
            <strong>Important:</strong> After logging in through ${platformName}, you'll be able to
            access this course directly in PrairieLearn in the future.
          </p>
        </div>
      </div>
    `,
  });
}
