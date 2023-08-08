import { html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';

import { PlanName } from '../../lib/billing/plans-types';
import { compiledScriptTag } from '../../../lib/assets';
import { Course, CourseInstance } from '../../../lib/db-types';

export function StudentCourseInstanceUpgrade({
  course,
  course_instance,
  missingPlans,
  resLocals,
}: {
  course: Course;
  course_instance: CourseInstance;
  missingPlans: PlanName[];
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
          <h1>
            <i class="fa-solid fa-lock"></i>
            Upgrade required
          </h1>
          <p>
            <strong>${course.short_name}: ${course.title}, ${course_instance.long_name}</strong>
            requires an upgrade to support certain features selected by your instructor.
          </p>

          <ul class="list-group mb-3">
            ${missingPlans.map((planName) => BillingLineItem(planName))}
            <li class="list-group-item d-flex justify-content-between align-items-center bg-light">
              <strong>Total</strong>
              <strong>$16</strong>
            </li>
          </ul>

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
            <input type="hidden" name="unsafe_plan_names" value="${missingPlans.join(',')}" />
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
        </main>
      </body>
    </html>
  `.toString();
}

export function CourseInstanceStudentUpdateSuccess({
  paid,
  resLocals,
}: {
  paid: boolean;
  resLocals: Record<string, any>;
}) {
  // TODO: handle the paid and unpaid case.
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
          SUCCESS!!

          <a href="https://google.com" class="btn btn-primary">
            Continue to COURSE INSTANCE NAME HERE
          </a>
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
        <strong>$${price}</strong>
      </div>
    </li>
  `;
}
