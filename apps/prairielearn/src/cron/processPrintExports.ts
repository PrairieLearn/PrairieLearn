import { processQueuedPrintExports } from '../lib/printing/print-exports.js';

export async function run() {
  await processQueuedPrintExports();
}
