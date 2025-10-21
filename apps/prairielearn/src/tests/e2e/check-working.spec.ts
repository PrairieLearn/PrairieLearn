import * as sqldb from '@prairielearn/postgres';

import { expect, test } from './fixtures.js';

test('has title', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('[DEV] Home | PrairieLearn');
  console.log(sqldb.getConfig());
});
