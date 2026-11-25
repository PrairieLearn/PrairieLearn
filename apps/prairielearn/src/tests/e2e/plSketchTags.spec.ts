import type {} from '../../lib/client/mathjax.js';
import { selectQuestionByQid } from '../../models/question.js';

import { expect, test } from './fixtures.js';

function mathItemCount(element: Element): number {
  return window.MathJax.startup.document.getMathItemsWithin([element]).length;
}

function tagLayout(elements: Element[]) {
  return elements.map((element) => {
    const bounds = element.getBoundingClientRect();
    const point = element.parentElement!.querySelector('.point')!.getBoundingClientRect();
    const align = element.parentElement!.getAttribute('data-align');
    const anchor =
      bounds.x + (align === 'middle' ? bounds.width / 2 : align === 'end' ? bounds.width : 0);
    return {
      width: element.getAttribute('width'),
      height: element.getAttribute('height'),
      transform: element.getAttribute('transform'),
      aligned: Math.abs(anchor - (point.x + point.width / 2)) < 1,
    };
  });
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
  await expect(overlayToggle).toHaveAttribute('aria-pressed', 'false');
  await expect(overlayTag).toBeHidden();
  await overlayTag.evaluate((element) => {
    const laterTag = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    laterTag.setAttribute('class', 'overlay');
    laterTag.setAttribute('x', '50');
    laterTag.setAttribute('y', '50');
    laterTag.textContent = 'Later solution annotation';
    element.parentElement!.append(laterTag);
  });
  const laterTag = submission.getByText('Later solution annotation', { exact: true });
  await expect(laterTag).toBeHidden();
  await expect(submission.locator('.tag:not(.overlay)')).toHaveCount(9);
  await overlayToggle.click();
  await expect(overlayToggle).toHaveAttribute('aria-pressed', 'true');
  await expect(overlayTag).toBeVisible();
  await expect(laterTag).toBeVisible();

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
          {name: 'point', id: 'point', tag: {mathjax: true, xoffset: 5, yoffset: -5}},
          {name: 'point', id: 'legacy', readonly: true, tag: {latex: true}},
          {name: 'point', id: 'literal', readonly: true, tag: {}},
        ],
        initialstate: {
          point: [{x: 200, y: 150, tag: 'Label \\(x\\)'}],
          legacy: [{x: 50, y: 50, tag: 'z^2'}],
          literal: [{x: 50, y: 250, tag: 'Costs $5 and $10'}],
        },
      });
    `,
  });
  const standalone = page.locator('#editable-tag-example');
  const tag = standalone.locator('.tag').filter({ hasText: /^(Label|Updated)/ });
  await expect(tag.locator('mjx-container')).toHaveCount(1);
  await expect(tag).toContainText('Label');
  await expect(standalone.locator('.katex .katex-html')).toContainText('z');
  const literal = standalone.getByText('Costs $5 and $10', { exact: true });
  await expect(literal).toBeVisible();
  await expect(literal).toHaveAttribute('text-anchor', 'start');
  await expect(standalone.locator('text.tag mjx-container')).toHaveCount(0);
  const failures: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') failures.push(message.text());
  });
  await page.evaluate(() => {
    const math = window.MathJax;
    const typeset = math.typesetPromise.bind(math);
    math.typesetPromise = (elements: Element[]) => {
      if (elements.some((element) => element.closest('#editable-tag-example foreignObject.tag'))) {
        math.typesetPromise = typeset;
        return Promise.reject(new Error('Injected tag typesetting failure'));
      }
      return typeset(elements);
    };
  });
  await tag.dblclick();
  await page.getByRole('textbox').fill('Updated $y$');
  await page.getByRole('textbox').press('Enter');
  await expect(tag).toContainText('Updated');
  await expect
    .poll(() => failures.some((message) => message.includes('Injected tag typesetting failure')))
    .toBe(true);
  await expect(tag.locator('mjx-container')).toHaveCount(0);
  await standalone
    .locator('.si-toolbar > .item')
    .filter({ hasText: /^Select$/ })
    .getByRole('button')
    .click();
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

test('waits for standalone MathJax startup and measures tags after revealing and resizing', async ({
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
  const assets = await page.evaluate(() => ({
    script: document.querySelector<HTMLScriptElement>('script[src*="sketchresponse.min.js"]')!.src,
    style: document.querySelector<HTMLLinkElement>('link[href*="sketchresponse.min.css"]')!.href,
    math: document.querySelector<HTMLScriptElement>('script[src*="mathjax/tex-svg.js"]')!.src,
    fonts: new URL(
      document.querySelector('meta[name="mathjax-fonts-path"]')!.getAttribute('content')!,
      location.href,
    ).href,
  }));
  const host = await page.context().newPage();
  try {
    await host.setContent(
      '<div id="visible" class="si-container"></div><div id="hidden" class="si-container" style="display:none"></div>',
    );
    await host.addStyleTag({ url: assets.style });
    await host.addScriptTag({ url: assets.script });
    await host.evaluate((fonts) => {
      let ready!: () => void;
      const promise = new Promise<void>((resolve) => {
        ready = resolve;
      });
      window.MathJax = {
        tex: {
          inlineMath: [
            ['$', '$'],
            ['\\(', '\\)'],
          ],
        },
        loader: { paths: { 'mathjax-newcm': fonts } },
        startup: {
          promise,
          pageReady: () => window.MathJax.startup.defaultPageReady().then(ready),
        },
      };
    }, assets.fonts);
    await host.addScriptTag({
      content: String.raw`
      for (const id of ['visible', 'hidden']) {
        new window.sketchresponse.default(document.getElementById(id), id, {
          width: 420, height: 300,
          plugins: [
            {name: 'point', id: 'answer', label: 'Answer \\(x\\)'},
            ...['start', 'middle', 'end'].map(align => ({
              name: 'point', id: align, readonly: true, tag: {mathjax: true, align},
            })),
          ],
          initialstate: Object.fromEntries(['start', 'middle', 'end'].map((align, index) => [
            align, [{x: 200, y: 70 + index * 80, tag: 'Reference \\(x^2\\)'}],
          ])),
        });
      }
    `,
    });
    await expect(host.locator('foreignObject.tag')).toHaveCount(6);
    await expect(host.locator('.tag mjx-container')).toHaveCount(0);
    await host.addScriptTag({ url: assets.math });
    await expect(host.locator('.tag mjx-container')).toHaveCount(6);
    await expect(host.locator('#visible .si-toolbar > #answer mjx-container')).toHaveCount(1);
    await host.locator('.tag').evaluateAll((elements) => {
      for (const element of elements) {
        const id = element.parentElement!.querySelector('.point')!.classList;
        element.parentElement!.setAttribute(
          'data-align',
          ['start', 'middle', 'end'].find((align) => id.contains(`plugin-id-${align}`))!,
        );
      }
    });
    const visible = host.locator('#visible .tag');
    const hidden = host.locator('#hidden .tag');
    await expect
      .poll(async () => (await visible.evaluateAll(tagLayout)).every((tag) => tag.aligned))
      .toBe(true);
    const expected = await visible.evaluateAll(tagLayout);
    const originalMath = await hidden.first().locator('mjx-container').elementHandle();
    await host.locator('#hidden').evaluate((element) => {
      element.style.display = '';
    });
    await expect.poll(() => hidden.evaluateAll(tagLayout)).toEqual(expected);
    await host.evaluate(async () => {
      await document.fonts.ready;
      for (const element of document.querySelectorAll<HTMLElement>('.tag > div')) {
        element.style.fontSize = '24px';
      }
      for (const element of document.querySelectorAll<HTMLElement>('.si-container')) {
        element.style.width = '212px';
      }
    });
    await expect
      .poll(async () =>
        (await visible.evaluateAll(tagLayout)).every(
          (tag) => tag.aligned && tag.height !== expected[0].height,
        ),
      )
      .toBe(true);
    await expect
      .poll(() => hidden.evaluateAll(tagLayout))
      .toEqual(await visible.evaluateAll(tagLayout));
    expect(await originalMath.evaluate((element) => element.isConnected)).toBe(true);
    await expect(host.locator('mjx-container [data-mml-node="merror"]')).toHaveCount(0);
  } finally {
    await host.close();
  }
});
