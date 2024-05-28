import { errorAbandonedJobs } from '../lib/server-jobs.js';

export async function run() {
  await errorAbandonedJobs();
}
