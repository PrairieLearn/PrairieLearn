import type { Page } from '@playwright/test';

import { makeAssessmentInstance } from '../../../lib/assessment.js';
import { serializePrintDocument } from '../../../lib/client/print-document.js';
import { generateCsrfToken } from '../../../middlewares/csrfToken.js';
import { selectAssessmentByTid } from '../../../models/assessment.js';
import { getConfiguredUser } from '../../utils/auth.js';
import { expect } from '../fixtures.js';

export async function createPrintableAssessmentInstance(courseInstanceId: string, tid: string) {
  const user = await getConfiguredUser();
  const assessment = await selectAssessmentByTid({ course_instance_id: courseInstanceId, tid });
  return await makeAssessmentInstance({
    assessment,
    user_id: user.id,
    authn_user_id: user.id,
    mode: 'Public',
    time_limit_min: null,
    date: new Date(),
    client_fingerprint_id: null,
  });
}

export async function waitForPrintablePage(page: Page): Promise<void> {
  const root = page.locator(':root');
  await expect(root).toHaveAttribute('data-print-status', /^(ready|error)$/);
  const state = await root.evaluate((element) => ({
    status: element.dataset.printStatus,
    error: element.dataset.printError,
  }));
  expect(state).toEqual({ status: 'ready', error: undefined });
}

export async function downloadPrintableWord(page: Page, printUrl: string, search: string) {
  const source = await page.evaluate(() =>
    JSON.parse(document.getElementById('pl-print-docx-source')!.textContent),
  );
  const id = await page.locator(':root').getAttribute('data-print-snapshot-id');
  const html = await page.locator(':root').evaluate(serializePrintDocument);
  const { id: authnUserId } = await getConfiguredUser();
  return await page.request.post(`${printUrl}/docx?${search}`, {
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/octet-stream',
      'X-CSRF-Token': generateCsrfToken({ url: `${printUrl}/docx`, authnUserId }),
    },
    data: JSON.stringify({ id, html, source }),
    timeout: 30_000,
  });
}
