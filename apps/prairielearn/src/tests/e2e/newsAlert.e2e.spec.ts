import type { Page } from '@playwright/test';

import { upsertCachedNewsItem } from '../../models/news-items.js';

import { expect, test } from './fixtures.js';

async function syncAllCourses(page: Page) {
  await page.goto('/pl/loadFromDisk');
  await expect(page).toHaveURL(/\/jobSequence\//);
  await expect(page.locator('.badge', { hasText: 'Success' })).toBeVisible();
}

test.describe('News alert', () => {
  test.beforeAll(async ({ browser, workerPort }) => {
    const page = await browser.newPage({ baseURL: `http://localhost:${workerPort}` });
    await syncAllCourses(page);
    await page.close();

    // Insert a test news item
    // The dev user is an administrator in devMode, so they'll see instructor courses
    // and therefore the news alert
    await upsertCachedNewsItem({
      title: 'Test News Item for E2E',
      link: 'https://example.com/news/test-e2e-item',
      pub_date: new Date(),
      guid: `test-news-item-${Date.now()}`,
    });
  });

  test('shows news alert to instructors with unread items', async ({ page }) => {
    await page.goto('/');

    // Verify the alert is visible
    const alert = page.getByRole('alert');
    await expect(alert).toBeVisible();

    // Verify the heading within the alert
    await expect(page.getByRole('heading', { name: 'News' })).toBeVisible();

    // Verify the news item link is present
    const itemLink = page.getByRole('link', { name: 'Test News Item for E2E' });
    await expect(itemLink).toBeVisible();
    await expect(itemLink).toHaveAttribute('href', 'https://example.com/news/test-e2e-item');
    await expect(itemLink).toHaveAttribute('target', '_blank');
  });

  test('can dismiss the news alert', async ({ page }) => {
    // Insert a new news item for this test since the previous test's item may have been dismissed
    await upsertCachedNewsItem({
      title: 'Another Test News Item',
      link: 'https://example.com/news/another-test-item',
      pub_date: new Date(),
      guid: `test-news-item-dismiss-${Date.now()}`,
    });

    await page.goto('/');

    // Verify alert is initially visible
    const alert = page.getByRole('alert');
    await expect(alert).toBeVisible();

    // Click the dismiss button
    const dismissButton = page.getByRole('button', { name: 'Dismiss news alert' });
    await dismissButton.click();

    // Wait for page to reload after form submission
    await expect(page).toHaveURL('/');

    // Verify alert is no longer visible after dismissal
    await expect(page.getByRole('alert')).not.toBeVisible();
  });
});
