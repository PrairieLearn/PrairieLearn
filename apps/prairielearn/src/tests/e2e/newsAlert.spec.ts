/* eslint-disable react-hooks/rules-of-hooks */
import path from 'node:path';

import { type Page, test as base } from '@playwright/test';
import * as tmp from 'tmp-promise';

import { TEST_COURSE_PATH } from '../../lib/paths.js';
import { upsertNewsItem } from '../../models/news-items.js';

import { expect } from './fixtures.js';
import { setupWorkerServer } from './serverUtils.js';

const { execSync } = await import('node:child_process');
const fs = await import('node:fs/promises');

const test = base.extend<{ baseURL: string }, { workerPort: number }>({
  workerPort: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use, workerInfo) => {
      const tempDir = await tmp.dir({ unsafeCleanup: true });
      const tempTestCoursePath = path.join(tempDir.path, 'testCourse');
      await fs.cp(TEST_COURSE_PATH, tempTestCoursePath, { recursive: true });

      execSync('git init -b master', { cwd: tempTestCoursePath });
      execSync('git add -A', { cwd: tempTestCoursePath });
      execSync('git config user.name "Dev User"', { cwd: tempTestCoursePath });
      execSync('git config user.email "dev@example.com"', { cwd: tempTestCoursePath });
      execSync('git commit -m "Initial commit"', { cwd: tempTestCoursePath });

      await setupWorkerServer(workerInfo, use, {
        courseDirs: [tempTestCoursePath],
        configOverrides: {
          // Enable the news feed feature so the home page shows news alerts.
          newsFeedUrl: 'https://example.com/feed.xml',
        },
      });

      await tempDir.cleanup();
    },
    { scope: 'worker' },
  ],

  baseURL: async ({ workerPort }, use) => {
    await use(`http://localhost:${workerPort}`);
  },
});

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
