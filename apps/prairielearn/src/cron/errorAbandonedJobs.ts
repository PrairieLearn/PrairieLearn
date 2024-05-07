import { errorAbandonedJobs } from '../lib/server-jobs';

export async function run() {
  await errorAbandonedJobs();
}
