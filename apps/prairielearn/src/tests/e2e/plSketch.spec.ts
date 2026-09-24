import type { Locator } from '@playwright/test';

import { selectQuestionByQid } from '../../models/question.js';

import { expect, test } from './fixtures.js';

async function expectCanvasSize(canvas: Locator, width: number) {
  await expect(canvas).toHaveAttribute('viewBox', '0 0 800 450');
  await expect.poll(async () => (await canvas.boundingBox())!.width).toBeCloseTo(width, 0);
  await expect
    .poll(async () => {
      const box = (await canvas.boundingBox())!;
      return box.height / box.width;
    })
    .toBeCloseTo(450 / 800, 3);
}

async function resizeSketch(sketch: Locator, width: number) {
  await sketch.evaluate((element, width) => {
    // The library container has a one-pixel border around the canvas.
    (element as HTMLElement).style.width = `${width + 2}px`;
  }, width);
  await expectCanvasSize(sketch.locator('.si-canvas'), width);
}

test.beforeEach(async ({ page, courseInstance }) => {
  const question = await selectQuestionByQid({
    qid: 'sketchResponsive',
    course_id: courseInstance.course_id,
  });
  await page.goto(
    `/pl/course_instance/${courseInstance.id}/instructor/question/${question.id}/preview`,
  );
});

test('scales the canvas and promotes tools without filling gaps beside the active tool', async ({
  page,
}) => {
  const sketch = page.locator('.sketchresponse .si-container').first();
  const toolbar = sketch.locator('.si-toolbar');
  const more = toolbar.getByRole('button', { name: 'More', exact: true });
  await resizeSketch(sketch, 551);
  await expect(more).toBeVisible();

  const visibleTools = toolbar.locator(':scope > .item:visible');
  const toolCount = await visibleTools.count();
  for (const name of ['Polygon', 'Spline', 'Freeform', 'Vertical line']) {
    await more.click();
    await toolbar.locator('.si-overflow-menu').getByRole('button', { name, exact: true }).click();
    await expect(toolbar.locator(':scope > .item[data-is-active="true"]')).toBeVisible();
    await expect(visibleTools).toHaveCount(toolCount);
    await expect(visibleTools).toHaveText([
      'Select',
      'Point',
      'Horizontal line',
      name,
      '⋯More',
      'Delete',
      'Undo',
      'Redo',
      'Help',
    ]);
  }

  await resizeSketch(sketch, 300);
  for (const name of ['Delete', 'Undo', 'Redo', 'Help']) {
    await expect(toolbar.getByRole('button', { name, exact: true })).toBeVisible();
  }
  await expect.poll(() => toolbar.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await resizeSketch(sketch, 800);
  await expect(more).toBeHidden();
});

test('preserves drawing coordinates through submission and readonly scaling', async ({ page }) => {
  const sketch = page.locator('.sketchresponse .si-container').first();
  await resizeSketch(sketch, 551);
  await sketch.getByRole('button', { name: 'Point', exact: true }).click();
  const canvas = sketch.locator('.si-canvas');
  const box = (await canvas.boundingBox())!;
  await canvas.click({ position: { x: box.width * 0.7, y: box.height * 0.4 } });

  const requestPromise = page.waitForRequest(
    (request) =>
      request.method() === 'POST' &&
      request.postData()?.includes('sketchresponse-submission') === true,
  );
  await page.getByRole('button', { name: /Save & Grade/ }).click();
  const request = await requestPromise;
  const body = request.postDataJSON() as Record<string, string>;
  const saved = JSON.parse(
    Buffer.from(body['sketch-sketchresponse-submission'], 'base64').toString(),
  ) as {
    data: { point: { x: number; y: number }[] };
  };
  expect(saved.data.point).toHaveLength(1);
  expect(saved.data.point[0].x).toBeCloseTo(560, 0);
  expect(saved.data.point[0].y).toBeCloseTo(180, 0);

  const submission = page.getByTestId('submission-with-feedback').first();
  const readonly = submission.locator('.si-container');
  await expect(readonly.locator('.si-canvas .point').first()).toBeVisible();
  await expect(readonly.locator('.si-toolbar')).toBeHidden();
  await resizeSketch(readonly, 300);
  await expect(readonly.locator('.si-canvas .point:not(.overlay)')).toHaveAttribute('cx', /560/);
  await expect(readonly.locator('.si-canvas .point:not(.overlay)')).toHaveAttribute('cy', /180/);
});
