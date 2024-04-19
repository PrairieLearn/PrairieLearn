import * as serverJobs from '../lib/server-jobs-legacy';

export async function run() {
  await serverJobs.errorAbandonedJobs();
}
