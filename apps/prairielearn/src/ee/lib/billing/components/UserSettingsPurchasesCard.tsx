import { type StripeCheckoutSession } from '../../../../lib/db-types.js';
import { type Purchase } from '../purchases.js';
import { formatStripePrice } from '../stripe.shared.js';

export function UserSettingsPurchasesCard({ purchases }: { purchases: Purchase[] }) {
  return (
    <div className="card mb-4">
      <div className="card-header bg-primary text-white d-flex">
        <h2>Purchases</h2>
      </div>

      {purchases.length === 0 ? (
        <div className="card-body text-muted">You don't currently have any purchases.</div>
      ) : (
        <PurchaseTable purchases={purchases} />
      )}
    </div>
  );
}

UserSettingsPurchasesCard.displayName = 'UserSettingsPurchasesCard';

function PurchaseTable({ purchases }: { purchases: Purchase[] }) {
  return (
    <div className="table-responsive">
      <table className="table" aria-label="Purchases">
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
          {purchases.map((purchase) => {
            const courseName = purchase.course
              ? `${purchase.course.short_name}: ${purchase.course.title}`
              : 'Unknown course';

            const courseInstanceName =
              purchase.course_instance?.long_name ?? 'Unknown course instance';

            return (
              <tr key={purchase.stripe_checkout_session.id}>
                <td>{purchase.stripe_checkout_session.id}</td>
                <td>
                  {purchase.course_instance != null ? (
                    <a href={`/pl/course_instance/${purchase.course_instance.id}`}>
                      {courseName} ({courseInstanceName})
                    </a>
                  ) : (
                    <span>
                      {courseName} ({courseInstanceName})
                    </span>
                  )}
                </td>
                <td>{purchase.stripe_checkout_session.created_at.toUTCString()}</td>
                <td>{formatStripePrice(purchase.stripe_checkout_session.data.amount_total)} USD</td>
                <td>
                  <StripeCheckoutSessionPaymentStatus session={purchase.stripe_checkout_session} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="card-footer">
        Contact <a href="mailto:support@prairielearn.com">support@prairielearn.com</a> to request a
        refund or if you have any questions about your purchases.
      </div>
    </div>
  );
}

function StripeCheckoutSessionPaymentStatus({ session }: { session: StripeCheckoutSession }) {
  if (session.data.payment_status === 'paid') {
    return <span className="badge text-bg-success">Payment received</span>;
  } else if (session.data.payment_status === 'unpaid') {
    return <span className="badge text-bg-secondary">Pending</span>;
  } else {
    return <span className="badge text-bg-warning">Unknown</span>;
  }
}
