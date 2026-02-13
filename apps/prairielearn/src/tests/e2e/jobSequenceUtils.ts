import type { Page } from '@playwright/test';

import { expect } from './fixtures.js';

/**
 * Waits for the job sequence page to show completion and checks for expected text in the job output.
 */
export async function waitForJobAndCheckOutput(page: Page, expectedTexts: string[]) {
  // Should be redirected to the job sequence page
  await expect(page).toHaveURL(/\/jobSequence\//);

  // Wait for job to complete (status badge shows Success)
  await expect(page.locator('.badge', { hasText: 'Success' })).toBeVisible();

  // Check for expected text in the job output (rendered in a <pre> element)
  const jobOutput = page.locator('pre');
  for (const text of expectedTexts) {
    await expect(jobOutput.getByText(text)).toBeVisible();
  }
}
