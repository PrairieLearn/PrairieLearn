import { html } from '@prairielearn/html';

import { type Purchase } from '../purchases';
import { formatStripePrice } from '../stripe';
import { StripeCheckoutSession } from '../../../../lib/db-types';

export function UserSettingsPurchasesCard({ purchases }: { purchases: Purchase[] }) {
  return html`
    <div class="card mb-4">
      <div class="card-header bg-primary text-white d-flex">Purchases</div>

      ${purchases.length === 0
        ? html` <div class="card-body text-muted">You don't currently have any purchases.</div> `
        : PurchaseTable({ purchases })}
    </div>
  `;
}

function PurchaseTable({ purchases }: { purchases: Purchase[] }) {
  return html`
    <div class="table-responsive">
      <table class="table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Course</th>
            <th>Date</th>
            <th>Amount</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${purchases.map((purchase) => {
            const courseName = purchase.course
              ? `${purchase.course.short_name}: ${purchase.course.title}`
              : 'Unknown course';

            const courseInstanceName =
              purchase.course_instance?.long_name ?? 'Unknown course instance';

            return html`<tr>
              <td>${purchase.stripe_checkout_session.id}</td>
              <td>
                <a
                  ${purchase.course_instance == null
                    ? ''
                    : html`href="/pl/course_instance/${purchase.course_instance?.id}"`}
                >
                  ${courseName} (${courseInstanceName})
                </a>
              </td>
              <td>${purchase.stripe_checkout_session.created_at?.toUTCString()}</td>
              <td>${formatStripePrice(purchase.stripe_checkout_session.data.amount_total)} USD</td>
              <td>
                ${StripeCheckoutSessionPaymentStatus({
                  session: purchase.stripe_checkout_session,
                })}
              </td>
            </tr>`;
          })}
        </tbody>
      </table>
      <div class="card-footer">
        Contact <a href="mailto:support@prairielearn.com">support@prairielearn.com</a>
        to request a refund or if you have any questions about your purchases.
      </div>
    </div>
  `;
}

function StripeCheckoutSessionPaymentStatus({ session }: { session: StripeCheckoutSession }) {
  if (session.data.payment_status === 'paid') {
    return html`<span class="badge badge-success">Payment received</span>`;
  } else if (session.data.payment_status === 'unpaid') {
    return html`<span class="badge badge-secondary">Pending</span>`;
  } else {
    return html`<span class="badge badge-warning">Unknown</span>`;
  }
}
