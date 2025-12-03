// Importing from fixtures picks up our worker-scoped fixtures.
import { expect, test } from './fixtures.js';

test('preact powered JSX is working', () => {
  // We need to ensure that Preact is used for JSX, not playwright's own JSX implementation.
  // https://github.com/PrairieLearn/PrairieLearn/pull/13493
  // https://github.com/microsoft/playwright/issues/26936
  const foo = <div>Hello</div>;
  expect(foo.constructor).toBeUndefined();
});

test('has title', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('[DEV] Home | PrairieLearn');
});
