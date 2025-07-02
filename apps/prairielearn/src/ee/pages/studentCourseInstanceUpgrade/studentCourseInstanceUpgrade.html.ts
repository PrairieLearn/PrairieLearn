import { html } from '@prairielearn/html';

import { HeadContents } from '../../../components/HeadContents.html.js';
import { Navbar } from '../../../components/Navbar.html.js';
import { compiledScriptTag } from '../../../lib/assets.js';
import { type Course, type CourseInstance } from '../../../lib/db-types.js';
import { type PlanName } from '../../lib/billing/plans-types.js';
import { formatStripePrice } from '../../lib/billing/stripe.js';

export function StudentCourseInstanceUpgrade({
  course,
  course_instance,
  missingPlans,
  planPrices,
  resLocals,
}: {
  course: Course;
  course_instance: CourseInstance;
  missingPlans: PlanName[];
  /**
   * `null` here will indicate that we aren't configured with Stripe credentials
   * and thus that we can't show prices of the upgrade button
   */
  planPrices: Record<string, number> | null;
  resLocals: Record<string, any>;
}) {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${HeadContents({ resLocals })} ${compiledScriptTag('studentCourseInstanceUpgradeClient.ts')}
      </head>
      <body>
        ${Navbar({ resLocals })}
        <main id="content" class="container mb-4">
          <h1>
            <i class="fa-solid fa-lock"></i>
            Upgrade required
          </h1>
          <p>
            <strong>${course.short_name}: ${course.title}, ${course_instance.long_name}</strong>
            requires an upgrade to support certain features selected by your instructor.
          </p>

          ${planPrices == null
            ? html`<p>Please contact your instructor for more information.</p>`
            : html`
                ${PriceTable({ planNames: missingPlans, planPrices })}

                <form method="POST">
                  <div class="form-check mb-3">
                    <input
                      type="checkbox"
                      class="form-check-input"
                      id="js-terms-agreement"
                      name="terms_agreement"
                      value="1"
                    />
                    <label class="form-check-label" for="js-terms-agreement">
                      I agree to the PrairieLearn
                      <a href="https://www.prairielearn.com/legal/terms">Terms of Service</a> and
                      <a href="https://www.prairielearn.com/legal/privacy">Privacy Policy</a>.
                    </label>
                  </div>

                  <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
                  ${missingPlans.map(
                    (plan) => html`
                      <input type="hidden" name="unsafe_plan_names" value="${plan}" />
                    `,
                  )}
                  <button
                    id="js-upgrade"
                    type="submit"
                    name="__action"
                    value="upgrade"
                    class="btn btn-primary d-block w-100"
                    disabled
                  >
                    Upgrade
                  </button>
                </form>
              `}
        </main>
      </body>
    </html>
  `.toString();
}

export function CourseInstanceStudentUpdateSuccess({
  course,
  course_instance,
  paid,
  resLocals,
}: {
  course: Course;
  course_instance: CourseInstance;
  paid: boolean;
  resLocals: Record<string, any>;
}) {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${HeadContents({ resLocals })}
      </head>
      <body>
        ${Navbar({ resLocals })}
        <main id="content" class="container mb-4">
          <h1>Thanks!</h1>

          ${paid
            ? html`
                <p>Your payment was successfully processed. You may now access the course.</p>

                <a href="/pl/course_instance/${course_instance.id}" class="btn btn-primary">
                  Continue to ${course.short_name}
                </a>
              `
            : html`
                <p>
                  Once your payment has been fully processed, check back for access to the course.
                </p>
              `}
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
      };
    case 'compute':
      return {
        name: 'Compute',
        description: 'Enables features like in-browser IDEs and code autograding.',
      };
    default:
      throw new Error(`Unknown plan name: ${planName}`);
  }
}

function BillingLineItem({ planName, planPrice }: { planName: PlanName; planPrice: number }) {
  const { name, description } = getPlanDetails(planName);

  const formattedPrice = formatStripePrice(planPrice);

  return html`
    <li class="list-group-item d-flex justify-content-between align-items-center">
      <div class="d-flex flex-column">
        ${name}
        <small class="text-muted text-small">${description}</small>
      </div>
      <div>
        <strong class="text-nowrap">${formattedPrice} USD</strong>
      </div>
    </li>
  `;
}

function PriceTable({
  planNames,
  planPrices,
}: {
  planNames: PlanName[];
  planPrices: Record<string, number>;
}) {
  const totalPrice = planNames.reduce((total, planName) => total + planPrices[planName], 0);
  const formattedTotalPrice = formatStripePrice(totalPrice);

  return html`
    <ul class="list-group mb-3">
      ${planNames.map((planName) => BillingLineItem({ planName, planPrice: planPrices[planName] }))}
      <li class="list-group-item d-flex justify-content-between align-items-center bg-light">
        <strong>Total</strong>
        <strong class="text-nowrap">${formattedTotalPrice} USD</strong>
      </li>
    </ul>
  `;
}
