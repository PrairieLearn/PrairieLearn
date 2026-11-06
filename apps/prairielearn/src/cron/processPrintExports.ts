import { processQueuedPrintExports } from '../lib/print-export-jobs.js';

export async function run() {
  await processQueuedPrintExports();
}
