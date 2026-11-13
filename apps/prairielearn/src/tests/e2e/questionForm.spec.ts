import type { Page } from '@playwright/test';

import { selectQuestionByQid } from '../../models/question.js';

import { expect, test } from './fixtures.js';

async function navigationIsBlocked(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });
}

test('tracks element form data through deferred initialization and submission', async ({
  page,
  courseInstance,
}) => {
  const question = await selectQuestionByQid({
    course_id: courseInstance.course_id,
    qid: 'addNumbers',
  });
  await page.goto(
    `/pl/course_instance/${courseInstance.id}/instructor/question/${question.id}/preview`,
  );

  // Insert a form through the same observer used when question panels are replaced.
  await page.locator('form.question-form').evaluate((original) => {
    const form = document.createElement('form');
    form.className = 'question-form';
    form.innerHTML = `
      <label>First answer <input name="answer" value="first"></label>
      <label>Second answer <input name="answer" value="second"></label>
      <input type="hidden" name="editor" data-deferred-initial-value>
      <input type="hidden" name="__csrf_token" value="initial-token">
      <input type="hidden" name="__variant_id" value="initial-variant">
      <input type="hidden" name="display" value="initial-display" data-skip-unload-check>
    `;
    form.addEventListener('formdata', (event) => {
      event.formData.append('answer', 'from-element');
      event.formData.set('editor', form.dataset.editorValue ?? '');
    });
    original.replaceWith(form);
  });
  const form = page.locator('form.question-form');
  await expect(form).toHaveAttribute('data-original-form-data', /answer=first/);
  expect(await navigationIsBlocked(page)).toBe(false);

  const baseline = new URLSearchParams((await form.getAttribute('data-original-form-data'))!);
  expect(baseline.getAll('answer')).toEqual(['first', 'second', 'from-element']);
  expect(baseline.has('__csrf_token')).toBe(false);
  expect(baseline.has('__variant_id')).toBe(false);
  expect(baseline.has('display')).toBe(false);

  await form.evaluate((element: HTMLFormElement) => {
    element.querySelector<HTMLInputElement>('[name="__csrf_token"]')!.value = 'new-token';
    element.querySelector<HTMLInputElement>('[name="__variant_id"]')!.value = 'new-variant';
    element.querySelector<HTMLInputElement>('[name="display"]')!.value = 'new-display';
  });
  expect(await navigationIsBlocked(page)).toBe(false);

  await page.getByLabel('First answer').fill('edited');
  await form.evaluate((element: HTMLFormElement) => {
    element.dataset.editorValue = 'restored';
    element.querySelector<HTMLInputElement>('[name="editor"]')!.setAttribute('value', 'restored');
  });
  await expect(form).toHaveAttribute('data-original-form-data', /editor=restored/);
  const initializedBaseline = new URLSearchParams(
    (await form.getAttribute('data-original-form-data'))!,
  );
  expect(initializedBaseline.getAll('answer')).toEqual(['first', 'second', 'from-element']);
  expect(await navigationIsBlocked(page)).toBe(true);

  await page.getByLabel('First answer').fill('first');
  expect(await navigationIsBlocked(page)).toBe(false);
  await form.evaluate((element: HTMLFormElement) => {
    element.dataset.editorValue = 'edited again';
    element
      .querySelector<HTMLInputElement>('[name="editor"]')!
      .setAttribute('value', 'edited again');
  });
  expect(await navigationIsBlocked(page)).toBe(true);

  await form.dispatchEvent('submit');
  expect(await navigationIsBlocked(page)).toBe(false);
  await page.getByLabel('Second answer').fill('another edit');
  expect(await navigationIsBlocked(page)).toBe(true);
  await form.evaluate((element) => element.remove());
  await expect(form).toHaveCount(0);
  expect(await navigationIsBlocked(page)).toBe(false);
});

test('captures current Calculation answers before Save or Grade is clicked', async ({
  page,
  courseInstance,
}) => {
  const question = await selectQuestionByQid({
    course_id: courseInstance.course_id,
    qid: 'addVectors',
  });
  await page.goto(
    `/pl/course_instance/${courseInstance.id}/instructor/question/${question.id}/preview`,
  );
  const form = page.locator('form.question-form');
  await expect(form).toHaveAttribute('data-original-form-data', /postData=/);
  await expect(page.locator('[data-instavalue="submittedAnswer.wx"]')).toBeVisible();
  await expect.poll(() => navigationIsBlocked(page)).toBe(false);

  await page.locator('[data-instavalue="submittedAnswer.wx"]').fill('12');
  await page.locator('[data-instavalue="submittedAnswer.wy"]').fill('34');
  const captured = await form.evaluate((element: HTMLFormElement) =>
    JSON.parse(new FormData(element).get('postData')!.toString()),
  );
  expect(captured.submittedAnswer).toEqual({ wx: '12', wy: '34' });
  expect(await navigationIsBlocked(page)).toBe(true);

  const submitted = page.waitForRequest(
    (request) =>
      request.method() === 'POST' && request.postData()?.includes('__action=grade') === true,
  );
  await page.getByRole('button', { name: /Save & Grade/ }).click();
  const request = await submitted;
  expect(JSON.parse(request.postDataJSON().postData)).toEqual(captured);
  await expect(page.getByRole('heading', { name: 'Submitted answer' })).toBeVisible();
});
