import { expect, test } from '@playwright/test';

import * as sqldb from '@prairielearn/postgres';

test('has title', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('[DEV] Home | PrairieLearn');
  console.log(sqldb.getConfig());
});
