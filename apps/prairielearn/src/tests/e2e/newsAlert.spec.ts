import type { Page } from '@playwright/test';

import { upsertNewsItem } from '../../models/news-items.js';

import { expect, test } from './fixtures.js';

async function syncAllCourses(page: Page) {
  await page.goto('/pl/loadFromDisk');
  await expect(page).toHaveURL(/\/jobSequence\//);
  await expect(page.locator('.badge', { hasText: 'Success' })).toBeVisible();
}

test.describe.serial('News alert', () => {
  test.beforeAll(async ({ browser, workerPort }) => {
    const page = await browser.newPage({ baseURL: `http://localhost:${workerPort}` });
    await syncAllCourses(page);
    await page.close();
    await upsertNewsItem({
      title: 'Test News Item for E2E',
      link: 'https://example.com/news/test-e2e-item',
      pub_date: new Date(),
      guid: `test-news-item-${Date.now()}`,
    });
  });

  test('shows news alert to instructors with unread items', async ({ page }) => {
    await page.goto('/');

    const newsCard = page.locator('[data-testid="news-alert"]');
    await expect(newsCard).toBeVisible();

    await expect(page.getByRole('heading', { name: 'News' })).toBeVisible();

    const itemLink = page.getByRole('link', { name: 'Test News Item for E2E' });
    await expect(itemLink).toBeVisible();
    await expect(itemLink).toHaveAttribute('href', 'https://example.com/news/test-e2e-item');
    await expect(itemLink).toHaveAttribute('target', '_blank');
  });

  test('can dismiss the news alert', async ({ page }) => {
    await page.goto('/');

    const newsCard = page.locator('[data-testid="news-alert"]');
    await expect(newsCard).toBeVisible();

    const dismissButton = page.getByRole('button', { name: 'Dismiss news alert' });
    await dismissButton.click();

    await expect(page).toHaveURL('/');

    await expect(page.locator('[data-testid="news-alert"]')).not.toBeVisible();
  });
});
