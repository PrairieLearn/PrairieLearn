import type { Page } from '@playwright/test';

import { expect, test } from './fixtures.js';

async function syncAllCourses(page: Page) {
  await page.goto('/pl/loadFromDisk');
  await expect(page).toHaveURL(/\/jobSequence\//);
  await expect(page.locator('.badge', { hasText: 'Success' })).toBeVisible();
}

test.describe('Enrollment code OTP input', () => {
  test.beforeAll(async ({ browser, workerPort }) => {
    const page = await browser.newPage({ baseURL: `http://localhost:${workerPort}` });
    await syncAllCourses(page);
    await page.close();
  });

  test('can open the enrollment code modal from home page', async ({ page }) => {
    await page.goto('/pl');
    await expect(page).toHaveTitle(/PrairieLearn/);

    // Click the "Add course" button to open the modal
    await page.getByRole('button', { name: 'Add course' }).click();

    // Modal should open
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('dialog').locator('.modal-title')).toHaveText('Join a course');

    // OTP input should be present with correct aria-label
    const otpInput = page.locator('[aria-label="Enrollment code"]');
    await expect(otpInput).toBeVisible();
  });

  test('can type enrollment code character by character', async ({ page }) => {
    await page.goto('/pl');
    await page.getByRole('button', { name: 'Add course' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Find the hidden input with the aria-label
    const otpInput = page.locator('[aria-label="Enrollment code"]');

    // Type characters one by one
    await otpInput.fill('ABCDEFGHIJ');

    // Verify the input value
    await expect(otpInput).toHaveValue('ABCDEFGHIJ');

    // Verify visual boxes display the characters
    const boxes = page.locator('.pl-ui-otp-box');
    await expect(boxes).toHaveCount(10);

    // Check first few characters are displayed
    await expect(boxes.nth(0)).toHaveText('A');
    await expect(boxes.nth(1)).toHaveText('B');
    await expect(boxes.nth(2)).toHaveText('C');
    await expect(boxes.nth(9)).toHaveText('J');
  });

  test('filters non-alphanumeric characters and converts to uppercase', async ({ page }) => {
    await page.goto('/pl');
    await page.getByRole('button', { name: 'Add course' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    const otpInput = page.locator('[aria-label="Enrollment code"]');

    // Type with special characters and lowercase
    await otpInput.fill('abc-def-ghij');

    // Should be filtered and uppercased
    await expect(otpInput).toHaveValue('ABCDEFGHIJ');
  });

  test('handles paste of full enrollment code with dashes', async ({ page }) => {
    await page.goto('/pl');
    await page.getByRole('button', { name: 'Add course' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    const otpInput = page.locator('[aria-label="Enrollment code"]');

    // Simulate pasting a code with dashes (common format)
    await otpInput.fill('ABC-DEF-GHIJ');

    // Dashes should be stripped
    await expect(otpInput).toHaveValue('ABCDEFGHIJ');
  });

  test('truncates input to 10 characters', async ({ page }) => {
    await page.goto('/pl');
    await page.getByRole('button', { name: 'Add course' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    const otpInput = page.locator('[aria-label="Enrollment code"]');

    // Type more than 10 characters
    await otpInput.fill('ABCDEFGHIJKLMNOP');

    // Should be truncated to 10
    await expect(otpInput).toHaveValue('ABCDEFGHIJ');
  });

  test('shows validation error for incomplete code on submit', async ({ page }) => {
    await page.goto('/pl');
    await page.getByRole('button', { name: 'Add course' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    const otpInput = page.locator('[aria-label="Enrollment code"]');

    // Type incomplete code
    await otpInput.fill('ABC');

    // Click submit
    await page.getByRole('button', { name: 'Join course' }).click();

    // Should show validation error
    await expect(page.getByText('Code must be 10 alphanumeric characters')).toBeVisible();
  });

  test('shows server error for invalid enrollment code', async ({ page }) => {
    await page.goto('/pl');
    await page.getByRole('button', { name: 'Add course' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    const otpInput = page.locator('[aria-label="Enrollment code"]');

    // Type a complete but invalid code
    await otpInput.fill('INVALIDCOD');

    // Click submit
    await page.getByRole('button', { name: 'Join course' }).click();

    // Should show server error (the exact message depends on server response)
    // Wait for the alert to appear
    await expect(page.locator('.alert-danger')).toBeVisible({ timeout: 10000 });
  });

  test('displays separators between box groups', async ({ page }) => {
    await page.goto('/pl');
    await page.getByRole('button', { name: 'Add course' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Check that separators are rendered (spans with '-' text between box groups)
    const separators = page
      .getByText('-', { exact: true })
      .filter({ hasNot: page.locator('.pl-ui-otp-box') });
    await expect(separators).toHaveCount(2); // Two separators for [3]-[3]-[4] pattern
  });

  test('focus ring appears on current input position', async ({ page }) => {
    await page.goto('/pl');
    await page.getByRole('button', { name: 'Add course' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    const otpInput = page.locator('[aria-label="Enrollment code"]');

    // Focus the input
    await otpInput.focus();

    // First box should have focus class (when empty, focus is on first box)
    const boxes = page.locator('.pl-ui-otp-box');
    await expect(boxes.first()).toHaveClass(/focused/);

    // Type some characters
    await otpInput.fill('ABC');

    // Focus should now be on the 4th box (index 3)
    await expect(boxes.nth(3)).toHaveClass(/focused/);
  });

  test('focus ring stays on last box when code is complete', async ({ page }) => {
    await page.goto('/pl');
    await page.getByRole('button', { name: 'Add course' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    const otpInput = page.locator('[aria-label="Enrollment code"]');

    // Fill complete code
    await otpInput.fill('ABCDEFGHIJ');

    // Focus the input
    await otpInput.focus();

    // Last box should have focus class (stays on last when complete)
    const boxes = page.locator('.pl-ui-otp-box');
    await expect(boxes.last()).toHaveClass(/focused/);
  });

  test('can close and reopen modal with cleared state', async ({ page }) => {
    await page.goto('/pl');

    // Open modal and type some code
    await page.getByRole('button', { name: 'Add course' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    const otpInput = page.locator('[aria-label="Enrollment code"]');
    await otpInput.fill('ABC');
    await expect(otpInput).toHaveValue('ABC');

    // Close modal
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();

    // Reopen modal
    await page.getByRole('button', { name: 'Add course' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Input should be cleared
    const newOtpInput = page.locator('[aria-label="Enrollment code"]');
    await expect(newOtpInput).toHaveValue('');
  });
});
