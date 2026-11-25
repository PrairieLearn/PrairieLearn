import type {} from '../../lib/client/mathjax.js';
import { selectQuestionByQid } from '../../models/question.js';

import { expect, test } from './fixtures.js';

function mathItemCount(element: Element): number {
  return window.MathJax.startup.document.getMathItemsWithin([element]).length;
}

test('preserves fixed text and math tags across submission, answer, and overlay views', async ({
  page,
  courseInstance,
}) => {
  const question = await selectQuestionByQid({
    qid: 'sketchTags',
    course_id: courseInstance.course_id,
  });
  await page.goto(
    `/pl/course_instance/${courseInstance.id}/instructor/question/${question.id}/preview`,
  );
  const sketch = page.locator('.sketchresponse .si-container').first();
  await expect(sketch.locator('.tag:not(.overlay)')).toHaveCount(9);
  await expect(sketch.locator('.tag:not(.overlay) mjx-container')).toHaveCount(2);
  await expect(sketch.getByText('Polyline', { exact: true })).toBeVisible();
  await expect(sketch.getByText('Region', { exact: true })).toBeVisible();
  await expect(sketch.locator('mjx-container [data-mml-node="merror"]')).toHaveCount(0);

  await expect(sketch.getByText('Plain point', { exact: true })).toBeVisible();
  const referenceTag = sketch.locator('.tag:not(.overlay)').filter({ hasText: /^Point / });
  const originalMath = await referenceTag.locator('mjx-container').elementHandle();
  await referenceTag.dblclick();
  await expect(page.getByRole('dialog', { name: 'Enter tag value' })).toHaveCount(0);

  const referencePoint = sketch.locator('.point.plugin-id-given-point').first();
  const referenceX = await referencePoint.getAttribute('cx');
  const referenceY = await referencePoint.getAttribute('cy');
  const referenceBox = (await referencePoint.boundingBox())!;
  await page.mouse.move(
    referenceBox.x + referenceBox.width / 2,
    referenceBox.y + referenceBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(referenceBox.x + 40, referenceBox.y + 30, { steps: 5 });
  await page.mouse.up();
  await expect(referencePoint).toHaveAttribute('cx', referenceX!);
  await expect(referencePoint).toHaveAttribute('cy', referenceY!);

  await sketch.evaluate((element) => {
    (element as HTMLElement).style.width = '402px';
  });
  await expect
    .poll(async () => (await sketch.locator('.si-canvas').boundingBox())!.width)
    .toBeCloseTo(400, 0);
  await expect(referencePoint).toHaveAttribute('cx', referenceX!);
  await expect(referencePoint).toHaveAttribute('cy', referenceY!);

  await sketch
    .locator('.si-toolbar > .item')
    .filter({ hasText: 'Student point' })
    .getByRole('button')
    .first()
    .click();
  const canvas = sketch.locator('.si-canvas');
  const box = (await canvas.boundingBox())!;
  await canvas.click({ position: { x: box.width / 2, y: box.height / 2 } });
  await expect(sketch.locator('.point.plugin-id-response')).toHaveCount(1);
  await expect(sketch.locator('.tag:not(.overlay)')).toHaveCount(9);

  expect(await originalMath.evaluate((element) => element.isConnected)).toBe(true);

  const requestPromise = page.waitForRequest(
    (request) =>
      request.method() === 'POST' &&
      request.postData()?.includes('tags-sketchresponse-submission') === true,
  );
  await page.getByRole('button', { name: /Save & Grade/ }).click();
  const request = await requestPromise;
  const form = request.postDataJSON() as Record<string, string>;
  const saved = JSON.parse(
    Buffer.from(form['tags-sketchresponse-submission'], 'base64').toString(),
  ) as {
    data: Record<string, { tag?: string }[]>;
    gradeable: Record<string, { tag?: string }[]>;
  };
  expect(saved.data['given-point'][0].tag).toBe(String.raw`Point \(A_1\)`);
  expect(saved.gradeable['given-point'][0].tag).toBe(String.raw`Point \(A_1\)`);
  expect(saved.data.response[0].tag).toBeUndefined();
  expect(saved.gradeable.response[0].tag).toBeUndefined();

  const submission = page.getByTestId('submission-with-feedback').first();
  await expect(submission.locator('.tag:not(.overlay)')).toHaveCount(9);
  const answer = page.locator('.answer-body');
  await expect(answer.locator('.tag')).toHaveCount(10);

  const overlayToggle = submission.getByRole('button', { name: 'Toggle solution display' });
  const overlayTag = submission.locator('.tag.overlay');
  await expect(overlayTag).toHaveCount(1);
  await expect(overlayTag).toBeVisible();
  await overlayToggle.click();
  await expect(overlayTag).toBeHidden();
  await expect(submission.locator('.tag:not(.overlay)')).toHaveCount(9);
  await overlayToggle.click();
  await expect(overlayTag).toBeVisible();

  await page.reload();
  await expect(
    page.getByTestId('submission-with-feedback').first().locator('.tag:not(.overlay)'),
  ).toHaveCount(9);
});

test('updates editable host-math tags and clears removed math content', async ({
  page,
  courseInstance,
}) => {
  const question = await selectQuestionByQid({
    qid: 'sketchTags',
    course_id: courseInstance.course_id,
  });
  await page.goto(
    `/pl/course_instance/${courseInstance.id}/instructor/question/${question.id}/preview`,
  );
  await page.locator('.tag mjx-container').first().waitFor();
  await page.addScriptTag({
    content: String.raw`
      const tagExample = document.createElement('div');
      tagExample.id = 'editable-tag-example';
      tagExample.className = 'si-container';
      tagExample.tabIndex = 0;
      document.body.append(tagExample);
      new window.sketchresponse.default(tagExample, 'editable-tag-example', {
        width: 420,
        height: 300,
        plugins: [
          {name: 'point', id: 'point', tag: {xoffset: 5, yoffset: -5}},
          {name: 'point', id: 'legacy', readonly: true, tag: {latex: true}},
        ],
        initialstate: {
          point: [{x: 200, y: 150, tag: 'Label \\(x\\)'}],
          legacy: [{x: 50, y: 50, tag: 'z^2'}],
        },
      });
    `,
  });
  const standalone = page.locator('#editable-tag-example');
  const tag = standalone.locator('.tag').filter({ hasText: /^(Label|Updated)/ });
  await expect(tag.locator('mjx-container')).toHaveCount(1);
  await expect(tag).toContainText('Label');
  await expect(standalone.locator('.katex .katex-html')).toContainText('z');
  await tag.dblclick();
  await page.getByRole('textbox').fill('Updated $y$');
  await page.getByRole('textbox').press('Enter');
  await expect(tag).toContainText('Updated');
  await expect(tag.locator('mjx-container')).toHaveCount(1);
  await expect.poll(() => standalone.evaluate(mathItemCount)).toBe(1);

  await standalone.locator('.point').first().click();
  await standalone
    .locator('.si-toolbar > .item')
    .filter({ hasText: 'Delete' })
    .getByRole('button')
    .first()
    .click();
  await expect(tag).toHaveCount(0);
  await expect.poll(() => standalone.evaluate(mathItemCount)).toBe(0);
});
