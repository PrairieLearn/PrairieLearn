import { retryReviewDeliveries } from '../lib/course-agent/review.js';

export async function run() {
  await retryReviewDeliveries();
}
