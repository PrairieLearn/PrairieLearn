import { selectQuestionByQid } from '../../models/question.js';

import { expect, test } from './fixtures.js';

for (const tool of ['Spline', 'Polyline']) {
  test(`${tool} starts a new curve after loading editable initial drawings`, async ({
    page,
    courseInstance,
  }) => {
    const question = await selectQuestionByQid({
      qid: 'sketchInitial',
      course_id: courseInstance.course_id,
    });
    await page.goto(
      `/pl/course_instance/${courseInstance.id}/instructor/question/${question.id}/preview`,
    );

    const sketch = page.locator('.sketchresponse .si-container').first();
    const toolbar = sketch.locator('.si-toolbar');
    const canvas = sketch.locator('.si-canvas');
    const curves = canvas.locator(`path.${tool.toLowerCase()}[d]:not([d=""])`);
    await expect(curves).toHaveCount(1);
    const initialPath = (await curves.first().getAttribute('d'))!;

    await toolbar.getByRole('button').filter({ hasText: tool }).click();
    const box = (await canvas.boundingBox())!;
    await canvas.click({ position: { x: box.width * 0.4, y: box.height * 0.2 } });
    await canvas.click({ position: { x: box.width * 0.45, y: box.height * 0.3 } });
    await expect(curves).toHaveCount(2);
    await expect(curves.first()).toHaveAttribute('d', initialPath);

    await toolbar.getByRole('button').filter({ hasText: 'Undo' }).click();
    await toolbar.getByRole('button').filter({ hasText: 'Undo' }).click();
    await expect(curves).toHaveCount(1);
    await expect(curves.first()).toHaveAttribute('d', initialPath);

    await toolbar.getByRole('button').filter({ hasText: tool }).click();
    await canvas.click({ position: { x: box.width * 0.4, y: box.height * 0.2 } });
    await canvas.click({ position: { x: box.width * 0.45, y: box.height * 0.3 } });
    await page.getByRole('button', { name: /Save & Grade/ }).click();

    const submission = page.getByTestId('submission-with-feedback').first();
    const submittedCurves = submission.locator(`path.${tool.toLowerCase()}[d]:not([d=""])`);
    await expect(submittedCurves).toHaveCount(2);
  });
}
