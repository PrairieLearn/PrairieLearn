import { updateInstitutionSetting } from '../../models/institution-settings.js';

import { expect, test } from './fixtures.js';

const DEFAULT_INSTITUTION_ID = '1';

async function setCourseRequestMessage(message: string | null): Promise<void> {
  await updateInstitutionSetting({
    institution_id: DEFAULT_INSTITUTION_ID,
    field: 'course_request_message',
    value: message,
    authn_user_id: '1',
  });
}

test.describe.serial('Course request page institution message', () => {
  test.afterEach(async () => {
    await setCourseRequestMessage(null);
  });

  test('renders the institution message as Markdown', async ({ page }) => {
    await setCourseRequestMessage(
      '## Licensing\n\nContact **licensing@example.edu** for chargeback info.',
    );

    await page.goto('/pl/request_course');

    const card = page.getByTestId('institution-message-card');
    await expect(card).toBeVisible();
    await expect(card.getByRole('heading', { name: 'Licensing' })).toBeVisible();
    await expect(card.getByText('licensing@example.edu')).toBeVisible();
  });

  test('strips raw HTML from the message', async ({ page }) => {
    await setCourseRequestMessage(
      'Safe **bold** and an <img src=x onerror="window.injected=true"> tag.',
    );

    await page.goto('/pl/request_course');

    const card = page.getByTestId('institution-message-card');
    await expect(card).toBeVisible();
    await expect(card.getByText('bold')).toBeVisible();
    const injected = await page.evaluate(
      () => (window as unknown as { injected?: boolean }).injected,
    );
    expect(injected).toBeUndefined();
  });

  test('renders nothing when the message is empty', async ({ page }) => {
    await setCourseRequestMessage(null);

    await page.goto('/pl/request_course');

    await expect(page.getByRole('heading', { name: 'Request a course' })).toBeVisible();
    await expect(page.getByTestId('institution-message-card')).toHaveCount(0);
  });
});
