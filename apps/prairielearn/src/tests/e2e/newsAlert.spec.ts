import { setNewsItemHidden, upsertNewsItem } from '../../models/news-items.js';

import { createTest, expect } from './fixtures.js';
import { waitForJobAndCheckOutput } from './jobSequenceUtils.js';

const test = createTest({
  newsFeedUrl: 'https://example.com/feed.xml',
});

test.describe.serial('News alert', () => {
  test.beforeAll(async ({ browser, workerPort }) => {
    const page = await browser.newPage({ baseURL: `http://localhost:${workerPort}` });
    await page.goto('/pl/loadFromDisk');
    await waitForJobAndCheckOutput(page, []);
    await page.close();
    await upsertNewsItem({
      title: 'Test News Item for E2E',
      link: 'https://example.com/news/test-e2e-item',
      pub_date: new Date(),
      guid: `test-news-item-${Date.now()}`,
      categories: [],
    });
  });

  test('shows news alert to instructors with unread items', async ({ page }) => {
    await page.goto('/');

    const newsCard = page.locator('[data-testid="news-alert"]');
    await expect(newsCard).toBeVisible();

    const itemLink = page.getByRole('link', { name: 'Test News Item for E2E' });
    await expect(itemLink).toBeVisible();
    await expect(itemLink).toHaveAttribute('href', 'https://example.com/news/test-e2e-item');
    await expect(itemLink).toHaveAttribute('target', '_blank');
  });

  test('can dismiss all news items', async ({ page }) => {
    await page.goto('/');

    const newsCard = page.locator('[data-testid="news-alert"]');
    await expect(newsCard).toBeVisible();

    await page.getByRole('button', { name: 'Dismiss all' }).click();

    await expect(page).toHaveURL('/');
    await expect(page.locator('[data-testid="news-alert"]')).not.toBeVisible();
  });

  test('unhiding a previously-hidden item returns it to the new state', async ({ page }) => {
    const title = `Unhide Test ${Date.now()}`;
    const item = await upsertNewsItem({
      title,
      link: 'https://example.com/news/unhide-test',
      pub_date: new Date(),
      guid: `test-news-unhide-${Date.now()}`,
      categories: [],
    });

    await page.goto('/');
    await expect(page.getByRole('link', { name: title })).toBeVisible();

    await setNewsItemHidden(item.id, true);
    await page.goto('/');
    await expect(page.getByRole('link', { name: title })).not.toBeVisible();

    await setNewsItemHidden(item.id, false);
    await page.goto('/');
    await expect(page.getByRole('link', { name: title })).toBeVisible();
  });

  test('re-upserting a hidden item updates its fields but keeps it hidden', async ({ page }) => {
    const originalTitle = `Sync Update Original ${Date.now()}`;
    const updatedTitle = `Sync Update Updated ${Date.now()}`;
    const guid = `test-news-sync-update-${Date.now()}`;
    const item = await upsertNewsItem({
      title: originalTitle,
      link: 'https://example.com/news/sync-update',
      pub_date: new Date(),
      guid,
      categories: [],
    });

    await setNewsItemHidden(item.id, true);

    await upsertNewsItem({
      title: updatedTitle,
      link: 'https://example.com/news/sync-update',
      pub_date: new Date(),
      guid,
      categories: [],
    });

    await page.goto('/');
    await expect(page.getByRole('link', { name: originalTitle })).not.toBeVisible();
    await expect(page.getByRole('link', { name: updatedTitle })).not.toBeVisible();

    await setNewsItemHidden(item.id, false);
    await page.goto('/');
    await expect(page.getByRole('link', { name: updatedTitle })).toBeVisible();
    await expect(page.getByRole('link', { name: originalTitle })).not.toBeVisible();
  });
});
