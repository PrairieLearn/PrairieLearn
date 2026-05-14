import superjson from 'superjson';
import { z } from 'zod';

import { createCourseTrpcClient } from '../../trpc/course/client.js';

import { expect, test } from './fixtures.js';

const CreateQuestionFormPropsSchema = z.object({
  trpcCsrfToken: z.string(),
  courseId: z.string(),
});

test.describe('Question creation', () => {
  test('creates a draft question from the Questions page', async ({ page, courseInstance }) => {
    await page.goto(`/pl/course/${courseInstance.course_id}/course_admin/questions`);

    await expect(page.getByRole('heading', { name: 'Questions' })).toBeVisible();
    await page.getByRole('link', { name: 'Create question' }).click();

    await expect(page).toHaveURL(/\/course_admin\/questions\/create$/);
    await page.waitForSelector('.js-hydrated-component');
    await expect(page.getByRole('heading', { name: 'Choose a starting point' })).toBeVisible();

    const props = CreateQuestionFormPropsSchema.parse(
      await page
        .locator('script[data-component="CreateQuestionForm"][data-component-props]')
        .textContent()
        .then((text) => superjson.parse(text ?? '{}')),
    );
    const cookies = await page.context().cookies();
    const trpc = createCourseTrpcClient({
      csrfToken: props.trpcCsrfToken,
      courseId: props.courseId,
      urlBase: page.url().match(/^https?:\/\/[^/]+/)?.[0],
      extraHeaders: {
        cookie: cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; '),
      },
    });
    const draft = await trpc.questions.createDraft.mutate({ startFrom: 'empty' });

    await page.goto(draft.editorUrl);

    await expect(page).toHaveURL(/\/question\/\d+\/draft$/);
    await expect(page.getByText(/Draft #\d+/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Edit question.html' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Preview draft' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Finalize question' })).toBeVisible();
  });
});
