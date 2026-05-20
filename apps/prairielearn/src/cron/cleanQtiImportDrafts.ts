import { cleanupOldQtiImportDrafts } from '../lib/qti-import-drafts.js';

export async function run() {
  await cleanupOldQtiImportDrafts();
}
