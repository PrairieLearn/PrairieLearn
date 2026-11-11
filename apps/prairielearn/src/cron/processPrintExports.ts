import { processQueuedPrintExports } from '../lib/print-exports.js';

export async function run() {
  await processQueuedPrintExports();
}
