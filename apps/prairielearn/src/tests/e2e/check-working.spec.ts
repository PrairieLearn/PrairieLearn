import * as sqldb from '@prairielearn/postgres';

// Importing from fixtures picks up our worker-scoped fixtures.
import { expect, test } from './fixtures.js';

test('has title', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('[DEV] Home | PrairieLearn');
  console.log(sqldb.getConfig());
});
