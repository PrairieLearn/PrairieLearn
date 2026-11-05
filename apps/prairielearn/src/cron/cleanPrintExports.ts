import { cleanExpiredPrintExports } from '../lib/print-export-jobs.js';

export async function run() {
  await cleanExpiredPrintExports();
}
