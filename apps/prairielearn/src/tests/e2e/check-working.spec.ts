// Importing from fixtures picks up our worker-scoped fixtures.
import { expect, test } from './fixtures.js';

test('has title', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('[DEV] Home | PrairieLearn');
});
