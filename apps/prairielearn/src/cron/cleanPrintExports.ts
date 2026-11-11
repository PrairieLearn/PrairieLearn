import { cleanExpiredPrintExports } from '../lib/print-exports.js';

export async function run() {
  await cleanExpiredPrintExports();
}
