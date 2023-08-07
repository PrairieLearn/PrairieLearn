import { html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';

import { PlanName } from '../../lib/billing/plans-types';

export function StudentCourseInstanceUpgrade({
  requiredPlans,
  resLocals,
}: {
  requiredPlans: PlanName[];
  resLocals: Record<string, any>;
}) {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${renderEjs(__filename, "<%- include('../../../pages/partials/head') %>", {
          ...resLocals,
        })}
      </head>
      <body>
        ${renderEjs(__filename, "<%- include('../../../pages/partials/navbar') %>", {
          ...resLocals,
          // This won't actually render anything on the page; it just has to be non-null.
          navPage: 'upgrade',
        })}
        <main class="container mb-4">
          <div class="d-flex flex-column justify-content-center text-center">
            <i class="fa-solid fa-lock fa-2xl"></i>
            <h1>Upgrade required</h1>
            <p>
              This course requires an upgrade to support certain features selected by your
              instructor.
            </p>
          </div>

          <ul class="list-group mb-3">
            ${requiredPlans.map((planName) => BillingLineItem(planName))}
          </ul>

          <div class="custom-control custom-checkbox">
            <input type="checkbox" class="custom-control-input" id="terms-agreement" />
            <label class="custom-control-label" for="terms-agreement">
              I agree to the PrairieLearn
              <a href="https://www.prairielearn.com/legal/terms">Terms of Service</a> and
              <a href="https://www.prairielearn.com/legal/privacy">Privacy Policy</a>.
            </label>
          </div>

          <p></p>
        </main>
      </body>
    </html>
  `.toString();
}

function getPlanDetails(planName: PlanName) {
  switch (planName) {
    case 'basic':
      return {
        name: 'Course access',
        description: 'Provides access to this course.',
        price: 10,
      };
    case 'compute':
      return {
        name: 'Compute',
        description: 'Enables features like in-browser IDEs and code autograding.',
        price: 6,
      };
    default:
      throw new Error(`Unknown plan name: ${planName}`);
  }
}

function BillingLineItem(planName: PlanName) {
  const { name, description, price } = getPlanDetails(planName);

  return html`
    <li class="list-group-item d-flex justify-content-between align-items-center">
      <div class="d-flex flex-column">
        ${name}
        <span class="text-muted text-small">${description}</span>
      </div>
      <div>
        <span class="badge badge-pill badge-primary">$${price}</span>
      </div>
    </li>
  `;
}
