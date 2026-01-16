import type { Page } from '@playwright/test';

import { upsertCachedBlogPost } from '../../models/blog-posts.js';

import { expect, test } from './fixtures.js';

async function syncAllCourses(page: Page) {
  await page.goto('/pl/loadFromDisk');
  await expect(page).toHaveURL(/\/jobSequence\//);
  await expect(page.locator('.badge', { hasText: 'Success' })).toBeVisible();
}

test.describe('Blog post alert', () => {
  test.beforeAll(async ({ browser, workerPort }) => {
    const page = await browser.newPage({ baseURL: `http://localhost:${workerPort}` });
    await syncAllCourses(page);
    await page.close();

    // Insert a test blog post
    // The dev user is an administrator in devMode, so they'll see instructor courses
    // and therefore the blog post alert
    await upsertCachedBlogPost({
      title: 'Test Blog Post for E2E',
      link: 'https://prairielearn.org/blog/test-e2e-post',
      pub_date: new Date(),
      guid: `test-blog-post-${Date.now()}`,
    });
  });

  test('shows blog post alert to instructors with unread posts', async ({ page }) => {
    await page.goto('/');

    // Verify the alert is visible
    const alert = page.getByRole('alert');
    await expect(alert).toBeVisible();

    // Verify the heading
    await expect(page.getByText('New from the PrairieLearn blog')).toBeVisible();

    // Verify the blog post link is present
    const postLink = page.getByRole('link', { name: 'Test Blog Post for E2E' });
    await expect(postLink).toBeVisible();
    await expect(postLink).toHaveAttribute('href', 'https://prairielearn.org/blog/test-e2e-post');
    await expect(postLink).toHaveAttribute('target', '_blank');
  });

  test('can dismiss the blog post alert', async ({ page }) => {
    // Insert a new blog post for this test since the previous test's post may have been dismissed
    await upsertCachedBlogPost({
      title: 'Another Test Blog Post',
      link: 'https://prairielearn.org/blog/another-test-post',
      pub_date: new Date(),
      guid: `test-blog-post-dismiss-${Date.now()}`,
    });

    await page.goto('/');

    // Verify alert is initially visible
    const alert = page.getByRole('alert');
    await expect(alert).toBeVisible();

    // Click the dismiss button
    const dismissButton = page.getByRole('button', { name: 'Dismiss blog alert' });
    await dismissButton.click();

    // Wait for page to reload after form submission
    await expect(page).toHaveURL('/');

    // Verify alert is no longer visible after dismissal
    await expect(page.getByRole('alert')).not.toBeVisible();
  });
});
