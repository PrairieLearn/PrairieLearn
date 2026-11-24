import { deliverUndeliveredReviewResults } from '../lib/course-agent/apply-changes.js';

/** Retry review results the course agent service has not acknowledged. */
export async function run() {
  await deliverUndeliveredReviewResults();
}
