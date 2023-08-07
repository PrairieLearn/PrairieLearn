import { html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';

import { PlanName } from '../../lib/billing/plans-types';
import { compiledScriptTag } from '../../../lib/assets';

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
        ${compiledScriptTag('studentCourseInstanceUpgradeClient.ts')}
      </head>
      <body>
        ${renderEjs(__filename, "<%- include('../../../pages/partials/navbar') %>", {
          ...resLocals,
          // This won't actually render anything on the page; it just has to be non-null.
          navPage: 'upgrade',
        })}
        <main class="container mb-4">
          <div class="d-flex flex-column justify-content-center mb-4">
            <h1>
              <i class="fa-solid fa-lock"></i>
              Upgrade required
            </h1>
            <p>
              This course requires an upgrade to support certain features selected by your
              instructor.
            </p>
          </div>

          <div class="row">
            <div class="col-md-8">
              <ul class="list-group mb-3">
                ${requiredPlans.map((planName) => BillingLineItem(planName))}
                <li
                  class="list-group-item d-flex justify-content-between align-items-center bg-light"
                >
                  <strong>Total</strong>
                  <strong>$16</strong>
                </li>
              </ul>
            </div>
            <div class="col-md-4">
              <form method="POST">
                <div class="custom-control custom-checkbox mb-3">
                  <input
                    type="checkbox"
                    class="custom-control-input"
                    id="js-terms-agreement"
                    name="terms_agreement"
                    value="1"
                  />
                  <label class="custom-control-label" for="js-terms-agreement">
                    I agree to the PrairieLearn
                    <a href="https://www.prairielearn.com/legal/terms">Terms of Service</a> and
                    <a href="https://www.prairielearn.com/legal/privacy">Privacy Policy</a>.
                  </label>
                </div>

                <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
                <button
                  id="js-upgrade"
                  type="submit"
                  name="__action"
                  value="upgrade"
                  class="btn btn-primary btn-block"
                  disabled
                >
                  Upgrade
                </button>
              </form>
            </div>
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
        <small class="text-muted text-small">${description}</small>
      </div>
      <div>
        <span class="badge badge-pill badge-primary">$${price}</span>
      </div>
    </li>
  `;
}
